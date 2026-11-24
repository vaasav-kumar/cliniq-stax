import type { Database } from "./db";
import { recordAudit } from "./audit";
import { findDuplicatePhones, ImportError, type ImportRowError, tableToPatientInputs } from "./import";
import { createPatient, parsePatient, type PatientInput } from "./repo";

// Checks the patient rows against each other and against the clinic's existing phones. Throws ImportError if any row is wrong.
// Row numbers match the file: row 2 is the first patient after the header row.
export async function checkPatientInputs(db: Database, clinicId: number, inputs: PatientInput[]): Promise<void> {
  const errors: ImportRowError[] = [...findDuplicatePhones(inputs)];
  const phones = inputs.map((i) => parsePatient(i).phone);
  const existing = await db.query<{ phone: string }>(
    "SELECT DISTINCT phone FROM patients WHERE clinic_id = @clinicId AND phone = ANY(@phones)",
    { clinicId, phones },
  );
  const existingPhones = new Set(existing.map((r) => r.phone));
  inputs.forEach((_input, index) => {
    const phone = phones[index];
    if (existingPhones.has(phone)) errors.push({ row: index + 2, message: `Phone ${phone} already belongs to a patient` });
  });
  if (errors.length) throw new ImportError(errors.sort((a, b) => a.row - b.row));
}

// Validates the whole table first. If anything is wrong, nothing is saved and every problem is reported.
// If everything is fine, all patients are saved in one transaction. Returns how many were saved.
export async function importPatients(db: Database, clinicId: number, userId: number, table: string[][]): Promise<number> {
  const inputs = tableToPatientInputs(table); // throws ImportError with row numbers
  await checkPatientInputs(db, clinicId, inputs);

  return db.tx(async (tx) => {
    for (const input of inputs) {
      await createPatient(tx, clinicId, input);
    }
    await recordAudit(tx, clinicId, userId, "patient.bulk_import", `${inputs.length} patients`);
    return inputs.length;
  });
}
