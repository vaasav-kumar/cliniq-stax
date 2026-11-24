import type { Database } from "./db";
import { recordAudit } from "./audit";
import { ValidationError } from "./domain";
import { parseFinanceText } from "./finance-import";
import { ImportError } from "./import";
import { checkPatientInputs } from "./import-service";
import { createPatient, createTransaction } from "./repo";

export type FinanceImportCounts = { patients: number; income: number; expense: number };

// Parses the image text and saves all patients, income and expenses in one transaction.
// If any row is wrong, nothing is saved and every problem is reported.
export async function importFinanceText(
  db: Database,
  clinicId: number,
  userId: number,
  text: string,
  options: { allowPatients: boolean },
): Promise<FinanceImportCounts> {
  const parsed = parseFinanceText(text);
  if (parsed.patients.length > 0 && !options.allowPatients) {
    throw new ValidationError("Your role cannot add patients, so remove the Patients section from the image.");
  }
  try {
    await checkPatientInputs(db, clinicId, parsed.patients);
  } catch (e) {
    if (e instanceof ImportError) {
      throw new ImportError(e.errors.map((err) => ({ row: err.row, message: `Patients, row ${err.row}: ${err.message}` })));
    }
    throw e;
  }

  const counts = {
    patients: parsed.patients.length,
    income: parsed.transactions.filter((t) => t.kind === "income").length,
    expense: parsed.transactions.filter((t) => t.kind === "expense").length,
  };
  await db.tx(async (tx) => {
    for (const p of parsed.patients) await createPatient(tx, clinicId, p);
    for (const t of parsed.transactions) await createTransaction(tx, clinicId, t);
    await recordAudit(
      tx,
      clinicId,
      userId,
      "finance.image_import",
      `${counts.patients} patients, ${counts.income} income, ${counts.expense} expenses`,
    );
  });
  return counts;
}
