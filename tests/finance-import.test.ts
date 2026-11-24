import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { registerClinic } from "../src/lib/accounts";
import { parseFinanceTable, transactionsFromTable } from "../src/lib/finance-import";
import { importFinanceTable } from "../src/lib/finance-import-service";
import { ImportError, parseCsv } from "../src/lib/import";
import { freshDb } from "./helpers";

function errorsOf(fn: () => unknown): { row: number; message: string }[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ImportError) return e.errors;
    throw e;
  }
  assert.fail("expected an ImportError");
}

const FILE = [
  "type,name,phone,reached_via,date,amount,category,description",
  "patient,Lakshmi R,9840012345,Instagram,,,,",
  "income,,,,03/11/2026,\"1,500\",Panchakarma,Course fee",
  "expense,,,,2026-11-04,800,Rent,",
  "patient,Kumar S,9123456789,Walk-in,,,,",
].join("\n");

test("a mixed CSV is split into patients, income and expenses", () => {
  const parsed = parseFinanceTable(parseCsv(FILE), "2026-11-24");
  assert.equal(parsed.patients.length, 2);
  assert.deepEqual(parsed.patientRows, [2, 5]);
  assert.deepEqual(parsed.transactions, [
    { kind: "income", entryDate: "2026-11-03", amount: 1500, category: "Panchakarma", description: "Course fee" },
    { kind: "expense", entryDate: "2026-11-04", amount: 800, category: "Rent", description: null },
  ]);
});

test("a file without a type column is rejected", () => {
  const errors = errorsOf(() => parseFinanceTable([["name", "phone"], ["A", "9840012345"]]));
  assert.match(errors[0].message, /Missing required column "type"/);
});

test("every bad row is reported with its file row number", () => {
  const text = [
    "type,name,phone,reached_via,amount,category",
    "income,,,,100,Consultation",
    "income,,,,0,Consultation",
    "income,,,,200,",
    "expense,,,,abc,Rent",
    "bogus,,,,,",
  ].join("\n");
  const errors = errorsOf(() => parseFinanceTable(parseCsv(text)));
  assert.deepEqual(errors.map((e) => e.row), [3, 4, 5, 6]);
  assert.match(errors[0].message, /^Income: Amount must be more than 0/);
  assert.match(errors[1].message, /^Income: Category is missing/);
  assert.match(errors[2].message, /^Expenses: Amount must be a valid amount/);
  assert.match(errors[3].message, /Type must be/);
});

test("income rows without a date use the given day", () => {
  const rows = transactionsFromTable([["amount", "category"], ["250", "other"]], "expense", "2026-11-24");
  assert.deepEqual(rows, [{ kind: "expense", entryDate: "2026-11-24", amount: 250, category: "Other", description: null }]);
});

test("an income table without an amount column is rejected", () => {
  const errors = errorsOf(() => transactionsFromTable([["date", "category"], ["03/11/2026", "Other"]], "income"));
  assert.match(errors.map((e) => e.message).join(" "), /Missing required column for amount/);
});

test("importing saves everything together, and nothing when a row is wrong", async (t: TestContext) => {
  const db = await freshDb(t);
  const { clinicId, userId } = await registerClinic(db, {
    clinicName: "Harsha Vedic",
    adminName: "Admin",
    email: "admin@example.com",
    password: "a-long-password",
  });

  const counts = await importFinanceTable(db, clinicId, userId, parseCsv(FILE), { allowPatients: true });
  assert.deepEqual(counts, { patients: 2, income: 1, expense: 1 });
  const [{ n: patients }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = @clinicId", { clinicId });
  const [{ n: txns }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM transactions WHERE clinic_id = @clinicId", { clinicId });
  assert.equal(patients, 2);
  assert.equal(txns, 2);

  const bad = FILE.replace("9123456789", "12345") + "\nincome,,,,01/11/2026,50,Other,";
  await assert.rejects(importFinanceTable(db, clinicId, userId, parseCsv(bad), { allowPatients: true }), ImportError);
  const [{ n: after }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM transactions WHERE clinic_id = @clinicId", { clinicId });
  assert.equal(after, 2);
});

test("a role without patient access cannot add patient rows", async (t: TestContext) => {
  const db = await freshDb(t);
  const { clinicId, userId } = await registerClinic(db, {
    clinicName: "Harsha Vedic",
    adminName: "Admin",
    email: "admin2@example.com",
    password: "a-long-password",
  });
  await assert.rejects(importFinanceTable(db, clinicId, userId, parseCsv(FILE), { allowPatients: false }), /Your role cannot add patients/);
});

test("ledger wording that is not an exact category is mapped, and the original text is kept", () => {
  const rows = transactionsFromTable(
    [["date", "amount", "category", "description"],
     ["10/11/2026", "1323", "Consultation + Medicines", "Mrs Chitra"],
     ["10/11/2026", "1000", "Medicines", ""],
     ["11/11/2026", "500", "Unclear", "cash"]],
    "income",
    "2026-11-24",
  );
  assert.deepEqual(rows.map((r) => r.category), ["Consultation", "Products", "Other"]);
  assert.equal(rows[0].description, "Consultation + Medicines · Mrs Chitra");
  assert.equal(rows[2].description, "Unclear · cash");
  const expense = transactionsFromTable([["amount", "category"], ["800", "Medicines"]], "expense", "2026-11-24");
  assert.equal(expense[0].category, "Medicines & herbs");
});
