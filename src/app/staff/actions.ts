"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { ForbiddenError, ValidationError } from "@/lib/domain";
import { createStaff, setStaffActive } from "@/lib/accounts";
import { currentUser } from "@/lib/session-server";
import type { ActionState } from "@/app/actions";

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
}

export async function addStaff(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await currentUser();
  if (!user) return { error: "Your session has ended. Please sign in again." };
  try {
    await createStaff(getDb(), user, {
      name: str(form, "name"),
      email: str(form, "email"),
      role: str(form, "role"),
      password: str(form, "password"),
    });
  } catch (e) {
    if (e instanceof ValidationError || e instanceof ForbiddenError) return { error: e.message };
    throw e;
  }
  revalidatePath("/staff");
  return { ok: true };
}

export async function toggleStaff(userId: number, active: boolean): Promise<void> {
  const user = await currentUser();
  if (!user) throw new Error("Your session has ended. Please sign in again.");
  await setStaffActive(getDb(), user, userId, active);
  revalidatePath("/staff");
}
