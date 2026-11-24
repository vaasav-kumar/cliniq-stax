"use server";

import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ValidationError } from "@/lib/domain";
import { authenticate, changePassword, registerClinic } from "@/lib/accounts";
import { CLINIC_SIGNUP_NOTIFY_TO, sendMail } from "@/lib/mailer";
import { createSession, deleteSession } from "@/lib/sessions";
import { clearSessionCookie, currentUser, setSessionCookie, sessionTokenFromCookie } from "@/lib/session-server";
import { recordAudit } from "@/lib/audit";
import type { ActionState } from "./actions";

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export async function login(_prev: ActionState, form: FormData): Promise<ActionState> {
  const db = getDb();
  let userId: number;
  let clinicId: number;
  try {
    ({ userId, clinicId } = await authenticate(db, str(form, "email"), str(form, "password")));
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  const token = await createSession(db, userId, clinicId);
  await recordAudit(db, clinicId, userId, "auth.login");
  setSessionCookie(token);
  redirect("/");
}

export async function logout(): Promise<void> {
  const db = getDb();
  const token = sessionTokenFromCookie();
  const user = await currentUser();
  if (token) await deleteSession(db, token);
  if (user) await recordAudit(db, user.clinicId, user.id, "auth.logout");
  clearSessionCookie();
  redirect("/login");
}

// Anyone can register a clinic unless the operator turns this off with ALLOW_CLINIC_SIGNUP=false.
export async function register(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (process.env.ALLOW_CLINIC_SIGNUP === "false") {
    return { error: "New clinic sign-up is currently closed. Please contact the Harsha Vedic team." };
  }
  const db = getDb();
  let clinicId: number;
  let userId: number;
  try {
    const logoFile = form.get("logo");
    let logo: { mime: string; data: Buffer } | null = null;
    if (logoFile instanceof File && logoFile.size > 0) {
      logo = { mime: logoFile.type, data: Buffer.from(await logoFile.arrayBuffer()) };
    }
    ({ clinicId, userId } = await registerClinic(db, {
      clinicName: str(form, "clinicName"),
      city: str(form, "city"),
      adminName: str(form, "adminName"),
      email: str(form, "email"),
      password: str(form, "password"),
      logo,
    }));
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  // Tell the Harsha Vedic team about the new clinic. Never a password. A failed email does not undo the registration.
  const clinicName = str(form, "clinicName") ?? "";
  const adminName = str(form, "adminName") ?? "";
  const adminEmail = str(form, "email") ?? "";
  const city = str(form, "city") || "Chennai";
  await sendMail(
    CLINIC_SIGNUP_NOTIFY_TO,
    `New clinic registered: ${clinicName}`,
    [
      "A new clinic has registered on the Clinic CRM.",
      "",
      `Clinic name: ${clinicName}`,
      `City: ${city}`,
      `Admin name: ${adminName}`,
      `Admin email: ${adminEmail}`,
      `Registered at: ${new Date().toISOString()}`,
    ].join("\n"),
  );
  setSessionCookie(await createSession(db, userId, clinicId));
  redirect("/");
}

export async function changeMyPassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has ended. Please sign in again." };
  const db = getDb();
  try {
    await changePassword(db, user.id, str(form, "current"), str(form, "next"));
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  // Sessions were cleared by the password change; start a fresh one for this browser.
  setSessionCookie(await createSession(db, user.id, user.clinicId));
  return { ok: true };
}
