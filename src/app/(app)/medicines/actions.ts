"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/domain";
import { authorize } from "@/lib/session-server";
import { cancelRequest, createRequest, dispenseRequest, recordPurchase } from "@/lib/medicines";
import type { Permission } from "@/lib/rbac";

export type MedicineActionState = { error?: string; ok?: boolean };

function str(form: FormData, key: string): string | undefined {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
}

async function guarded<T>(
  permission: Permission,
  fn: (clinicId: number, userId: number) => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const auth = await authorize(permission);
  if (!auth.ok) return { ok: false, error: auth.error };
  try {
    return { ok: true, value: await fn(auth.user.clinicId, auth.user.id) };
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { ok: false, error: e.message };
    throw e;
  }
}

// Records a purchase: stock goes up and the cost is booked as an expense.
export async function recordPurchaseAction(_prev: MedicineActionState, form: FormData): Promise<MedicineActionState> {
  const result = await guarded("inventory:write", (clinicId, userId) =>
    recordPurchase(getDb(), clinicId, userId, {
      name: str(form, "name"),
      unit: str(form, "unit"),
      quantity: str(form, "quantity"),
      unitCost: str(form, "unitCost"),
      supplier: str(form, "supplier"),
      purchaseDate: str(form, "purchaseDate"),
      reorderLevel: str(form, "reorderLevel"),
    }),
  );
  if (!result.ok) return { error: result.error };
  for (const p of ["/medicines", "/medicines/next-batch", "/finance", "/"]) revalidatePath(p);
  return { ok: true };
}

export async function requestMedicineAction(patientId: number, _prev: MedicineActionState, form: FormData): Promise<MedicineActionState> {
  const result = await guarded("visits:write", (clinicId) =>
    createRequest(getDb(), clinicId, {
      patientId,
      medicineId: Number(str(form, "medicineId")),
      quantity: str(form, "quantity"),
      notes: str(form, "notes"),
    }),
  );
  if (!result.ok) return { error: result.error };
  for (const p of [`/patients/${patientId}`, "/medicines/next-batch", "/"]) revalidatePath(p);
  return { ok: true };
}

// Used by plain buttons, so failures go back to the patient page as a message.
export async function dispenseAction(requestId: number, patientId: number): Promise<void> {
  const result = await guarded("inventory:write", (clinicId, userId) => dispenseRequest(getDb(), clinicId, userId, requestId));
  if (!result.ok) redirect(`/patients/${patientId}?medError=${encodeURIComponent(result.error)}`);
  for (const p of [`/patients/${patientId}`, "/medicines", "/medicines/next-batch", "/"]) revalidatePath(p);
}

export async function cancelRequestAction(requestId: number, patientId: number): Promise<void> {
  const result = await guarded("visits:write", (clinicId, userId) => cancelRequest(getDb(), clinicId, userId, requestId));
  if (!result.ok) redirect(`/patients/${patientId}?medError=${encodeURIComponent(result.error)}`);
  for (const p of [`/patients/${patientId}`, "/medicines/next-batch", "/"]) revalidatePath(p);
}
