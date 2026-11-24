// Reads one image that can hold three lists under headings "Patients", "Income" and "Expenses".
// Pure functions only (no database access) so they are easy to test. Database checks live in finance-import-service.ts.
import { ImportError, type ImportRowError, tableToPatientInputs } from "./import";
import type { PatientInput } from "./repo";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  ValidationError,
  optionalText,
  requireAmount,
  requireDate,
  todayIso,
} from "./domain";

export type FinanceSection = "patients" | "income" | "expense";
export type TransactionRowInput = {
  kind: "income" | "expense";
  entryDate: string;
  amount: number;
  category: string;
  description: string | null;
};
export type ParsedFinance = { patients: PatientInput[]; transactions: TransactionRowInput[] };

const HEADINGS: { pattern: RegExp; section: FinanceSection }[] = [
  { pattern: /^patients?\b[^a-z]*$/i, section: "patients" },
  { pattern: /^(incomes?|other income)\b[^a-z]*$/i, section: "income" },
  { pattern: /^(expenses?|expenditures?)\b[^a-z]*$/i, section: "expense" },
];

const SECTION_LABEL: Record<FinanceSection, string> = { patients: "Patients", income: "Income", expense: "Expenses" };

// Column names accepted in income and expense tables.
const TRANSACTION_COLUMNS: Record<string, "date" | "amount" | "category" | "description"> = {
  date: "date",
  entry_date: "date",
  amount: "amount",
  amount_inr: "amount",
  amount_rs: "amount",
  category: "category",
  description: "description",
  details: "description",
  notes: "description",
  particulars: "description",
};

// Splits one line of text into cells. Pipes, tabs and wide spacing win over commas, so amounts like 1,500 stay whole.
function splitLine(line: string): string[] {
  if (line.includes("|")) return line.split("|").map((c) => c.trim()).filter((c, i, a) => !(c === "" && (i === 0 || i === a.length - 1)));
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  if (/\s{2,}/.test(line)) return line.split(/\s{2,}/).map((c) => c.trim());
  return line.split(",").map((c) => c.trim());
}

function linesToTable(lines: string[]): string[][] {
  return lines.map(splitLine).filter((cells) => cells.some((c) => c !== ""));
}

// Splits the text into sections. Lines above the first heading are ignored (titles, dates, and so on).
export function splitByHeadings(text: string): { section: FinanceSection; lines: string[] }[] {
  const sections: { section: FinanceSection; lines: string[] }[] = [];
  const seen = new Set<FinanceSection>();
  let current: { section: FinanceSection; lines: string[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = HEADINGS.find((h) => h.pattern.test(line));
    if (heading) {
      if (seen.has(heading.section)) {
        throw new ImportError([{ row: 1, message: `The "${SECTION_LABEL[heading.section]}" heading appears more than once` }]);
      }
      seen.add(heading.section);
      current = { section: heading.section, lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (sections.length === 0) {
    throw new ImportError([{ row: 1, message: 'No "Patients", "Income" or "Expenses" heading was found in the image' }]);
  }
  return sections;
}

// Dates may be written yyyy-mm-dd or dd/mm/yyyy (or with - or . between the parts). Indian day-first order is assumed.
function parseDate(raw: string): string {
  const v = raw.trim();
  const m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return requireDate(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`, "Date");
  return requireDate(v, "Date");
}

// Turns one income or expense table (first row = column names) into rows. Collects every problem instead of stopping at the first.
export function transactionsFromTable(table: string[][], kind: "income" | "expense", today = todayIso()): TransactionRowInput[] {
  const errors: ImportRowError[] = [];
  if (table.length < 2) throw new ImportError([{ row: 1, message: "The table needs a header row and at least one entry" }]);

  const headers = table[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  const columns = headers.map((h) => {
    const column = TRANSACTION_COLUMNS[h];
    if (!column) errors.push({ row: 1, message: `Unknown column "${h}"` });
    return column ?? null;
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
      const category = categories.find((c) => c.toLowerCase() === categoryText.toLowerCase());
      if (!category) throw new ValidationError(`Category "${categoryText}" is not one of: ${categories.join(", ")}`);

      rows.push({ kind, entryDate, amount, category, description: optionalText(cell("description"), 300) });
    } catch (e) {
      if (e instanceof ValidationError) errors.push({ row: rowNumber, message: e.message });
      else throw e;
    }
  });
  if (errors.length) throw new ImportError(errors);
  return rows;
}

// Parses the whole image text. Every section is checked; the error messages name the section and row.
export function parseFinanceText(text: string, today = todayIso()): ParsedFinance {
  const sections = splitByHeadings(text);
  const errors: ImportRowError[] = [];
  const patients: PatientInput[] = [];
  const transactions: TransactionRowInput[] = [];

  for (const { section, lines } of sections) {
    const label = SECTION_LABEL[section];
    const table = linesToTable(lines);
    try {
      if (section === "patients") patients.push(...tableToPatientInputs(table));
      else transactions.push(...transactionsFromTable(table, section === "income" ? "income" : "expense", today));
    } catch (e) {
      if (!(e instanceof ImportError)) throw e;
      for (const err of e.errors) errors.push({ row: err.row, message: `${label}, row ${err.row}: ${err.message}` });
    }
  }
  if (errors.length) throw new ImportError(errors);
  if (patients.length === 0 && transactions.length === 0) {
    throw new ImportError([{ row: 1, message: "No rows were found under the headings" }]);
  }
  return { patients, transactions };
}
