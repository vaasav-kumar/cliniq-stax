// Bulk patient import: turns CSV text into patient rows, then validates every row.
// Pure functions only (no database access) so they are easy to test. The database checks live in repo.ts.
import { ValidationError } from "./domain";
import { parsePatient, type PatientInput } from "./repo";

export const IMPORT_MAX_ROWS = 500;

export type ImportRowError = { row: number; message: string };

export class ImportError extends Error {
  constructor(public readonly errors: ImportRowError[]) {
    super(`${errors.length} row(s) could not be imported`);
  }
}

// Column names accepted in the header row, mapped to the patient field they fill.
export const COLUMN_ALIASES: Record<string, keyof PatientInput> = {
  name: "name",
  full_name: "name",
  phone: "phone",
  mobile: "phone",
  email: "email",
  date_of_birth: "dateOfBirth",
  dob: "dateOfBirth",
  gender: "gender",
  address: "addressLine",
  apartment: "isApartment",
  is_apartment: "isApartment",
  apartment_name: "apartmentName",
  door_number: "doorNumber",
  door_num: "doorNumber",
  address_line: "addressLine",
  area: "area",
  city: "city",
  pincode: "pincode",
  reached_via: "reachedVia",
  source: "reachedVia",
  referred_by: "referredBy",
  notes: "notes",
  registered_on: "registeredOn",
};

const REQUIRED_COLUMNS: (keyof PatientInput)[] = ["name", "phone", "reachedVia"];

// RFC 4180-style CSV: quoted fields, "" escapes, commas or newlines inside quotes, CRLF or LF line endings.
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new ImportError([{ row: rows.length + 1, message: "A quoted field is not closed" }]);
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop fully blank lines.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// Converts a table (first row = headers) into patient inputs. Collects every problem instead of stopping at the first.
export function tableToPatientInputs(table: string[][]): PatientInput[] {
  const errors: ImportRowError[] = [];
  if (table.length < 2) throw new ImportError([{ row: 1, message: "The file needs a header row and at least one patient" }]);

  const headers = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const fieldForColumn: (keyof PatientInput | null)[] = headers.map((h) => {
    const field = COLUMN_ALIASES[h];
    if (!field) errors.push({ row: 1, message: `Unknown column "${h}"` });
    return field ?? null;
  });
  for (const required of REQUIRED_COLUMNS) {
    if (!fieldForColumn.includes(required)) {
      errors.push({ row: 1, message: `Missing required column for ${String(required)}` });
    }
  }
  if (errors.length) throw new ImportError(errors);

  const dataRows = table.slice(1);
  if (dataRows.length > IMPORT_MAX_ROWS) {
    throw new ImportError([{ row: 1, message: `A file can hold at most ${IMPORT_MAX_ROWS} patients` }]);
  }

  const inputs: PatientInput[] = [];
  dataRows.forEach((cells, index) => {
    const rowNumber = index + 2; // +1 for header, +1 because rows start at 1
    const input: Record<string, string> = {};
    fieldForColumn.forEach((field, col) => {
      if (field) input[field] = (cells[col] ?? "").trim();
    });
    try {
      // Validate exactly as the manual form does; this also normalises the phone number.
      parsePatient(input as unknown as PatientInput);
      inputs.push(input as unknown as PatientInput);
    } catch (e) {
      if (e instanceof ValidationError) {
        errors.push({ row: rowNumber, message: e.message });
      } else {
        throw e;
      }
    }
  });
  if (errors.length) throw new ImportError(errors);
  return inputs;
}

// Checks phones are unique within the file. Existing clinic phones are checked by the caller.
export function findDuplicatePhones(inputs: PatientInput[], rowNumbers: number[] = inputs.map((_, i) => i + 2)): ImportRowError[] {
  const seen = new Map<string, number>();
  const errors: ImportRowError[] = [];
  inputs.forEach((input, index) => {
    const phone = parsePatient(input).phone;
    const row = rowNumbers[index];
    const first = seen.get(phone);
    if (first !== undefined) {
      errors.push({ row, message: `Phone ${phone} is also on row ${first}` });
    } else {
      seen.set(phone, row);
    }
  });
  return errors;
}
