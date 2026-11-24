"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ValidationError } from "@/lib/domain";
import { ImportError, parseCsv, type ImportRowError } from "@/lib/import";
import { importFinanceTable } from "@/lib/finance-import-service";
import { can } from "@/lib/rbac";
import { authorize } from "@/lib/session-server";

export type FinanceImportState = { error?: string; rowErrors?: ImportRowError[] };

const CSV_MAX_BYTES = 1024 * 1024;

// Reads the CSV, validates every row, and saves all rows or none. Success returns to the income and expense page.
export async function importFinanceCsv(_prev: FinanceImportState, form: FormData): Promise<FinanceImportState> {
  const auth = await authorize("finance:write");
  if (!auth.ok) return { error: auth.error };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to upload." };
  if (file.size > CSV_MAX_BYTES) return { error: "The CSV file is larger than 1 MB." };

  try {
    const table = parseCsv(await file.text());
    await importFinanceTable(getDb(), auth.user.clinicId, auth.user.id, table, {
      allowPatients: can(auth.user.role, "patients:write"),
    });
  } catch (e) {
    if (e instanceof ImportError) return { rowErrors: e.errors };
    if (e instanceof ValidationError) return { error: e.message };
    throw e;
  }
  for (const p of ["/finance", "/", "/patients"]) revalidatePath(p);
  redirect("/finance");
}
