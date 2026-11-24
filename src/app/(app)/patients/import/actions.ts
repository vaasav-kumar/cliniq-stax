"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ValidationError } from "@/lib/domain";
import { authorize } from "@/lib/session-server";
import { ImportError, parseCsv, type ImportRowError, ocrTextToTable } from "@/lib/import";
import { importPatients } from "@/lib/import-service";
import { imageToText } from "@/lib/ocr";

export type ImportState = { error?: string; rowErrors?: ImportRowError[] };

const CSV_MAX_BYTES = 1024 * 1024;
const IMAGE_MAX_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

// Reads the file, converts it to rows, validates every row, and saves all rows or none.
// Any problem returns the list of row errors and saves nothing. Success redirects to the patients list.
async function runImport(form: FormData, kind: "csv" | "image"): Promise<ImportState> {
  const auth = await authorize("patients:write");
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
      const text = await imageToText(Buffer.from(await file.arrayBuffer()));
      table = ocrTextToTable(text);
    }
    await importPatients(getDb(), auth.user.clinicId, auth.user.id, table);
  } catch (e) {
    if (e instanceof ImportError) return { rowErrors: e.errors };
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  revalidatePath("/patients");
  redirect("/patients");
}

export async function importCsv(_prev: ImportState, form: FormData): Promise<ImportState> {
  return runImport(form, "csv");
}

export async function importImage(_prev: ImportState, form: FormData): Promise<ImportState> {
  return runImport(form, "image");
}
