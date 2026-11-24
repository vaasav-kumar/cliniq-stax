"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ValidationError } from "@/lib/domain";
import { authorize } from "@/lib/session-server";
import { ImportError, parseCsv, type ImportRowError, ocrTextToTable } from "@/lib/import";
import { importMedicines } from "@/lib/medicine-import";
import { imageToText } from "@/lib/ocr";

export type MedicineImportState = { error?: string; rowErrors?: ImportRowError[] };

const CSV_MAX_BYTES = 1024 * 1024;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Reads the file, validates every row, and saves all rows or none. Success goes to the inventory page.
async function runImport(form: FormData, kind: "csv" | "image"): Promise<MedicineImportState> {
  const auth = await authorize("inventory:write");
  if (!auth.ok) return { error: auth.error };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

  let table: string[][];
  try {
    if (kind === "csv") {
      if (file.size > CSV_MAX_BYTES) return { error: "The CSV file is larger than 1 MB." };
      table = parseCsv(await file.text());
    } else {
      if (!IMAGE_TYPES.includes(file.type)) return { error: "Upload a PNG, JPEG or WebP image." };
      if (file.size > IMAGE_MAX_BYTES) return { error: "The image is larger than 4 MB." };
      table = ocrTextToTable(await imageToText(Buffer.from(await file.arrayBuffer())));
    }
    await importMedicines(getDb(), auth.user.clinicId, auth.user.id, table);
  } catch (e) {
    if (e instanceof ImportError) return { rowErrors: e.errors };
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  for (const p of ["/medicines", "/medicines/next-batch", "/finance", "/"]) revalidatePath(p);
  redirect("/medicines");
}

export async function importMedicinesCsv(_prev: MedicineImportState, form: FormData): Promise<MedicineImportState> {
  return runImport(form, "csv");
}

export async function importMedicinesImage(_prev: MedicineImportState, form: FormData): Promise<MedicineImportState> {
  return runImport(form, "image");
}
