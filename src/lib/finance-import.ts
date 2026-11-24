// Bulk import of patients, income and expenses from one CSV file. Every row has a "type" column: patient, income or expense.
// Pure functions only (no database access). Database checks live in finance-import-service.ts.
import { COLUMN_ALIASES, ImportError, type ImportRowError, tableToPatientInputs } from "./import";
import type { PatientInput } from "./repo";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, ValidationError, optionalText, requireAmount, requireDate, todayIso } from "./domain";

export type TransactionRowInput = {
  kind: "income" | "expense";
  entryDate: string;
  amount: number;
  category: string;
  description: string | null;
};
export type ParsedFinance = {
  patients: PatientInput[];
  patientRows: number[]; // file row number of each patient, for error messages
  transactions: TransactionRowInput[];
};

const TYPE_COLUMN = "type";
const TRANSACTION_COLUMNS: Record<string, "date" | "amount" | "category" | "description"> = {
  date: "date",
  entry_date: "date",
  amount: "amount",
  amount_inr: "amount",
  amount_rs: "amount",
  category: "category",
  description: "description",
  details: "description",
  particulars: "description",
};

const hasOwn = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

// Words used in ledgers that are not the exact category names. The first matching rule wins.
// Anything still unmatched goes to "Other". The original wording is kept in the description.
const CATEGORY_RULES: Record<"income" | "expense", { pattern: RegExp; category: string }[]> = {
  income: [
    { pattern: /consult/i, category: "Consultation" },
    { pattern: /pancha/i, category: "Panchakarma" },
    { pattern: /pain/i, category: "Pain care" },
    { pattern: /women/i, category: "Women's health" },
    { pattern: /medic|herb|product|oil|tablet|capsule/i, category: "Products" },
  ],
  expense: [
    { pattern: /rent/i, category: "Rent" },
    { pattern: /salar|wage|staff/i, category: "Salaries" },
    { pattern: /medic|herb|oil|tablet|capsule/i, category: "Medicines & herbs" },
    { pattern: /electric|water|utilit|bill|wifi|internet|phone/i, category: "Utilities" },
    { pattern: /market|advert|\bads?\b|promo/i, category: "Marketing" },
    { pattern: /equip|machine|instrument/i, category: "Equipment" },
  ],
};

export function normalizeCategory(raw: string, kind: "income" | "expense", categories: readonly string[]): { category: string; note: string | null } {
  const exact = categories.find((c) => c.toLowerCase() === raw.trim().toLowerCase());
  if (exact) return { category: exact, note: null };
  const rule = CATEGORY_RULES[kind].find((r) => r.pattern.test(raw));
  return { category: rule ? rule.category : "Other", note: raw.trim() };
}

function parseDate(raw: string): string {
  const v = raw.trim();
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return requireDate(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, "Date");
  return requireDate(v, "Date");
}

// Turns an income or expense table (first row = column names) into rows. Collects every problem instead of stopping at the first.
export function transactionsFromTable(table: string[][], kind: "income" | "expense", today = todayIso()): TransactionRowInput[] {
  const errors: ImportRowError[] = [];
  if (table.length < 2) throw new ImportError([{ row: 1, message: "The table needs a header row and at least one entry" }]);

  const headers = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const columns = headers.map((h) => {
    const column = hasOwn(TRANSACTION_COLUMNS, h) ? TRANSACTION_COLUMNS[h] : null;
    if (!column) errors.push({ row: 1, message: `Unknown column "${h}"` });
    return column;
  });
  for (const required of ["amount", "category"] as const) {
    if (!columns.includes(required)) errors.push({ row: 1, message: `Missing required column for ${required}` });
  }
  if (errors.length) throw new ImportError(errors);

  const categories: readonly string[] = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const rows: TransactionRowInput[] = [];
  table.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2;
    const cell = (name: string) => {
      const col = columns.indexOf(name as never);
      return col === -1 ? "" : (cells[col] ?? "").trim();
    };
    try {
      const hasDateColumn = columns.includes("date");
      const dateText = cell("date");
      if (hasDateColumn && !dateText) throw new ValidationError("Date is missing");
      const entryDate = hasDateColumn ? parseDate(dateText) : today;

      const amountText = cell("amount").replace(/₹|rs\.?|,|\s/gi, "");
      if (!amountText) throw new ValidationError("Amount is missing");
      const amount = requireAmount(amountText, "Amount");
      if (amount <= 0) throw new ValidationError("Amount must be more than 0");

      const categoryText = cell("category");
      if (!categoryText) throw new ValidationError("Category is missing");
      const { category, note } = normalizeCategory(categoryText, kind, categories);
      const description = [note, cell("description")].filter(Boolean).join(" · ");

      rows.push({ kind, entryDate, amount, category, description: optionalText(description, 300) });
    } catch (e) {
      if (e instanceof ValidationError) errors.push({ row: rowNumber, message: e.message });
      else throw e;
    }
  });
  if (errors.length) throw new ImportError(errors);
  return rows;
}

// Parses the whole file. Patient rows and income/expense rows are checked separately, but every error keeps its file row number.
export function parseFinanceTable(table: string[][], today = todayIso()): ParsedFinance {
  if (table.length < 2) throw new ImportError([{ row: 1, message: "The file needs a header row and at least one row" }]);

  const headers = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const errors: ImportRowError[] = [];
  const typeCol = headers.indexOf(TYPE_COLUMN);
  if (typeCol === -1) errors.push({ row: 1, message: 'Missing required column "type" (patient, income or expense)' });
  headers.forEach((h) => {
    if (h !== TYPE_COLUMN && !hasOwn(COLUMN_ALIASES, h) && !hasOwn(TRANSACTION_COLUMNS, h)) {
      errors.push({ row: 1, message: `Unknown column "${h}"` });
    }
  });
  if (errors.length) throw new ImportError(errors);

  type Row = { row: number; cells: string[] };
  const groups: Record<"patient" | "income" | "expense", Row[]> = { patient: [], income: [], expense: [] };
  table.slice(1).forEach((cells, index) => {
    if (!cells.some((c) => c.trim() !== "")) return;
    const row = index + 2;
    const type = (cells[typeCol] ?? "").trim().toLowerCase();
    if (type === "patient" || type === "income" || type === "expense") groups[type].push({ row, cells });
    else errors.push({ row, message: 'Type must be "patient", "income" or "expense"' });
  });

  // Builds a table with just the columns this kind of row uses, so the existing validators can be reused.
  const subTable = (keep: (h: string) => boolean, rows: Row[]) => {
    const idx = headers.map((h, i) => (keep(h) ? i : -1)).filter((i) => i >= 0);
    return {
      table: [idx.map((i) => headers[i]), ...rows.map((r) => idx.map((i) => r.cells[i] ?? ""))],
      rowNumbers: rows.map((r) => r.row),
    };
  };
  const attempt = (label: string, rowNumbers: number[], fn: () => void) => {
    try {
      fn();
    } catch (e) {
      if (!(e instanceof ImportError)) throw e;
      for (const err of e.errors) {
        const row = err.row >= 2 ? rowNumbers[err.row - 2] ?? err.row : err.row;
        errors.push({ row, message: `${label}: ${err.message}` });
      }
    }
  };

  const patients: PatientInput[] = [];
  const patientRows: number[] = [];
  if (groups.patient.length) {
    const sub = subTable((h) => hasOwn(COLUMN_ALIASES, h), groups.patient);
    attempt("Patients", sub.rowNumbers, () => {
      patients.push(...tableToPatientInputs(sub.table));
      patientRows.push(...sub.rowNumbers);
    });
  }
  const transactions: TransactionRowInput[] = [];
  for (const kind of ["income", "expense"] as const) {
    if (!groups[kind].length) continue;
    const sub = subTable((h) => hasOwn(TRANSACTION_COLUMNS, h), groups[kind]);
    attempt(kind === "income" ? "Income" : "Expenses", sub.rowNumbers, () =>
      transactions.push(...transactionsFromTable(sub.table, kind, today)),
    );
  }

  if (errors.length) throw new ImportError(errors.sort((a, b) => a.row - b.row));
  if (patients.length === 0 && transactions.length === 0) {
    throw new ImportError([{ row: 1, message: "No rows were found in the file" }]);
  }
  return { patients, patientRows, transactions };
}
