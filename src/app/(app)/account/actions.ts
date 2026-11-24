"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { ValidationError } from "@/lib/domain";
import { LOGO_MAX_BYTES, LOGO_TYPES } from "@/lib/accounts";
import { recordAudit } from "@/lib/audit";
import { currentUser } from "@/lib/session-server";
import type { ActionState } from "@/app/actions";

// Only the clinic admin can change the clinic logo. It is shown to everyone in the clinic.
export async function uploadClinicLogo(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has ended. Please sign in again." };
  if (user.role !== "admin") return { error: "Only the clinic admin can change the logo." };

  const file = form.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (!LOGO_TYPES.includes(file.type)) return { error: "Upload a PNG, JPEG or WebP image." };
  if (file.size > LOGO_MAX_BYTES) return { error: "The logo must be 512 KB or smaller." };

  const db = getDb();
  const data = Buffer.from(await file.arrayBuffer());
  try {
    await db.tx(async (tx) => {
      await tx.query("UPDATE clinics SET logo_mime = @mime, logo_data = @data WHERE id = @clinicId", {
        mime: file.type,
        data,
        clinicId: user.clinicId,
      });
      await recordAudit(tx, user.clinicId, user.id, "clinic.logo_updated", file.type);
    });
  } catch (e) {
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/account");
  revalidatePath("/");
  return { ok: true };
}
