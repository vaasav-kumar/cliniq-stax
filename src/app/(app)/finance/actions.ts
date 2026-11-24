"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { ValidationError } from "@/lib/domain";
import { ImportError, type ImportRowError } from "@/lib/import";
import { importFinanceText } from "@/lib/finance-import-service";
import { imageToText } from "@/lib/ocr";
import { can } from "@/lib/rbac";
import { authorize } from "@/lib/session-server";

export type FinanceImageState = { error?: string; rowErrors?: ImportRowError[]; summary?: string };

const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Reads the image, then saves its patients, income and expenses only if every row passes.
export async function importFinanceImage(_prev: FinanceImageState, form: FormData): Promise<FinanceImageState> {
  const auth = await authorize("finance:write");
  if (!auth.ok) return { error: auth.error };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image to upload." };
  if (!IMAGE_TYPES.includes(file.type)) return { error: "Upload a PNG, JPEG or WebP image." };
  if (file.size > IMAGE_MAX_BYTES) return { error: "The image is larger than 4 MB." };

  try {
    const text = await imageToText(Buffer.from(await file.arrayBuffer()));
    const counts = await importFinanceText(getDb(), auth.user.clinicId, auth.user.id, text, {
      allowPatients: can(auth.user.role, "patients:write"),
    });
    revalidatePath("/finance");
    revalidatePath("/");
    revalidatePath("/patients");
    return {
      summary: `Saved ${counts.patients} patient(s), ${counts.income} income entr${counts.income === 1 ? "y" : "ies"} and ${counts.expense} expense(s).`,
    };
  } catch (e) {
    if (e instanceof ImportError) return { rowErrors: e.errors };
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
}
