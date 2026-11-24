import type { Database } from "./db";
import { recordAudit } from "./audit";
import { ValidationError } from "./domain";
import { parseFinanceTable } from "./finance-import";
import { ImportError } from "./import";
import { checkPatientInputs } from "./import-service";
import { createPatient, createTransaction } from "./repo";

export type FinanceImportCounts = { patients: number; income: number; expense: number };

// Parses the CSV table and saves all patients, income and expenses in one transaction.
// If any row is wrong, nothing is saved and every problem is reported.
export async function importFinanceTable(
  db: Database,
  clinicId: number,
  userId: number,
  table: string[][],
  options: { allowPatients: boolean },
): Promise<FinanceImportCounts> {
  const parsed = parseFinanceTable(table);
  if (parsed.patients.length > 0 && !options.allowPatients) {
    throw new ValidationError("Your role cannot add patients, so remove the patient rows from the file.");
  }
  try {
    await checkPatientInputs(db, clinicId, parsed.patients, parsed.patientRows);
  } catch (e) {
    if (e instanceof ImportError) {
      throw new ImportError(e.errors.map((err) => ({ row: err.row, message: `Patients: ${err.message}` })));
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
      "finance.csv_import",
      `${counts.patients} patients, ${counts.income} income, ${counts.expense} expenses`,
    );
  });
  return counts;
}
