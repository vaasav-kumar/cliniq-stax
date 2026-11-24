"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ForbiddenError, ValidationError, type Role } from "@/lib/domain";
import { authorize } from "@/lib/session-server";
import {
  createPatient,
  createTransaction,
  createVisit,
  markFollowUpDone,
  setVisitPaymentStatus,
} from "@/lib/repo";
import { recordAudit } from "@/lib/audit";
import { can } from "@/lib/rbac";

export type ActionState = { error?: string; ok?: boolean };

function str(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
}

// Checks the permission, then runs the write. Validation errors go back to the form.
async function guarded<T>(
  permission: Parameters<typeof authorize>[0],
  fn: (clinicId: number, userId: number, role: Role) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const auth = await authorize(permission);
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    return { ok: true, value: await fn(auth.user.clinicId, auth.user.id, auth.user.role) };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function addPatient(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await guarded("patients:write", async (clinicId, userId) => {
    const db = getDb();
    const id = await createPatient(db, clinicId, {
      name: str(form, "name"),
      phone: str(form, "phone"),
      email: str(form, "email"),
      dateOfBirth: str(form, "dateOfBirth"),
      gender: str(form, "gender"),
      isApartment: form.get("isApartment") === "on",
      apartmentName: str(form, "apartmentName"),
      doorNumber: str(form, "doorNumber"),
      addressLine: str(form, "addressLine"),
      area: str(form, "area"),
      city: str(form, "city"),
      pincode: str(form, "pincode"),
      reachedVia: str(form, "reachedVia"),
      referredBy: str(form, "referredBy"),
      notes: str(form, "notes"),
      registeredOn: str(form, "registeredOn"),
    });
    await recordAudit(db, clinicId, userId, "patient.created", `patient #${id}`);
    return id;
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/patients");
  revalidatePath("/");
  redirect(`/patients/${result.value}`);
}

export async function addVisit(patientId: number, _prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await guarded("visits:write", async (clinicId, userId, role) => {
    const db = getDb();
    // Only people who handle money may mark a visit as paid at creation.
    const requested = str(form, "paymentStatus");
    const paymentStatus = can(role, "finance:write") ? requested : "NOT_PAID";
    const id = await createVisit(db, clinicId, {
      patientId,
      visitDate: str(form, "visitDate"),
      service: str(form, "service"),
      status: str(form, "status"),
      fee: str(form, "fee"),
      paymentStatus,
      notes: str(form, "notes"),
      followUpDate: str(form, "followUpDate"),
    });
    await recordAudit(db, clinicId, userId, "visit.created", `visit #${id} for patient #${patientId}`);
    return id;
  });
  if (!result.ok) return { error: result.error };
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
  revalidatePath("/followups");
  revalidatePath("/finance");
  revalidatePath("/payments");
  return { ok: true };
}

// Marks one visit PAID or NOT_PAID. Used from the patient page and the Payments page.
export async function setPaymentStatus(visitId: number, status: "PAID" | "NOT_PAID", patientId?: number): Promise<void> {
  const result = await guarded("finance:write", async (clinicId, userId) => {
    const db = getDb();
    const found = await setVisitPaymentStatus(db, clinicId, visitId, status);
    if (!found) throw new ValidationError("Visit not found");
    await recordAudit(db, clinicId, userId, "visit.payment_status", `visit #${visitId} -> ${status}`);
  });
  if (!result.ok) throw new Error(result.error);
  revalidatePath("/payments");
  revalidatePath("/finance");
  revalidatePath("/");
  if (patientId) revalidatePath(`/patients/${patientId}`);
}

export async function completeFollowUp(visitId: number, patientId: number): Promise<void> {
  const result = await guarded("followups:manage", async (clinicId, userId) => {
    const db = getDb();
    await markFollowUpDone(db, clinicId, visitId);
    await recordAudit(db, clinicId, userId, "followup.done", `visit #${visitId}`);
  });
  if (!result.ok) throw new Error(result.error);
  revalidatePath("/followups");
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
}

export async function addTransaction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const result = await guarded("finance:write", async (clinicId, userId) => {
    const db = getDb();
    const id = await createTransaction(db, clinicId, {
      kind: str(form, "kind"),
      amount: str(form, "amount"),
      category: str(form, "category"),
      description: str(form, "description"),
      entryDate: str(form, "entryDate"),
    });
    await recordAudit(db, clinicId, userId, "transaction.created", `${str(form, "kind")} #${id}`);
    return id;
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/finance");
  revalidatePath("/");
  return { ok: true };
}
