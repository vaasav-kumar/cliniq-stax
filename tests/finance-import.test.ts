import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { registerClinic } from "../src/lib/accounts";
import { parseFinanceText, splitByHeadings, transactionsFromTable } from "../src/lib/finance-import";
import { importFinanceText } from "../src/lib/finance-import-service";
import { ImportError } from "../src/lib/import";
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

const IMAGE_TEXT = [
  "Harsha Vedic ledger",
  "Patients",
  "name | phone | reached_via",
  "Lakshmi R | 9840012345 | Instagram",
  "Kumar S | 9123456789 | Walk-in",
  "Income",
  "date | amount | category | description",
  "03/11/2026 | 1,500 | Panchakarma | Course fee",
  "Expenses",
  "date | amount | category",
  "2026-11-04 | ₹800 | Rent",
].join("\n");

test("sections are split by their headings and lines above the first heading are ignored", () => {
  const sections = splitByHeadings(IMAGE_TEXT);
  assert.deepEqual(sections.map((s) => s.section), ["patients", "income", "expense"]);
  assert.equal(sections[0].lines.length, 3);
});

test("a repeated heading or an image with no heading is rejected", () => {
  assert.match(errorsOf(() => splitByHeadings("Patients\nx\nPatients\ny"))[0].message, /more than once/);
  assert.match(errorsOf(() => splitByHeadings("just some text"))[0].message, /No "Patients"/);
});

test("the image text is split into patients, income and expenses", () => {
  const parsed = parseFinanceText(IMAGE_TEXT, "2026-11-24");
  assert.equal(parsed.patients.length, 2);
  assert.deepEqual(parsed.transactions, [
    { kind: "income", entryDate: "2026-11-03", amount: 1500, category: "Panchakarma", description: "Course fee" },
    { kind: "expense", entryDate: "2026-11-04", amount: 800, category: "Rent", description: null },
  ]);
});

test("income and expense rows without a date use the given day", () => {
  const rows = transactionsFromTable([["amount", "category"], ["250", "other"]], "expense", "2026-11-24");
  assert.deepEqual(rows, [{ kind: "expense", entryDate: "2026-11-24", amount: 250, category: "Other", description: null }]);
});

test("every bad row is reported with its section and row number", () => {
  const text = [
    "Income",
    "amount | category",
    "100 | Consultation",
    "0 | Consultation",
    "200 | Salary",
    "Expenses",
    "amount | category",
    "abc | Rent",
  ].join("\n");
  const errors = errorsOf(() => parseFinanceText(text));
  assert.deepEqual(errors.map((e) => e.row), [3, 4, 2]);
  assert.match(errors[0].message, /^Income, row 3: Amount must be more than 0/);
  assert.match(errors[1].message, /^Income, row 4: Category "Salary" is not one of/);
  assert.match(errors[2].message, /^Expenses, row 2: Amount must be a valid amount/);
});

test("an income table without an amount column is rejected", () => {
  const errors = errorsOf(() => transactionsFromTable([["date", "category"], ["03/11/2026", "Other"]], "income"));
  assert.match(errors.map((e) => e.message).join(" "), /Missing required column for amount/);
});

test("importing saves patients, income and expenses together and nothing when a row is wrong", async (t: TestContext) => {
  const db = await freshDb(t);
  const { clinicId, userId } = await registerClinic(db, {
    clinicName: "Harsha Vedic",
    adminName: "Admin",
    email: "admin@example.com",
    password: "a-long-password",
  });

  const counts = await importFinanceText(db, clinicId, userId, IMAGE_TEXT, { allowPatients: true });
  assert.deepEqual(counts, { patients: 2, income: 1, expense: 1 });
  const [{ n: patients }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM patients WHERE clinic_id = @clinicId", { clinicId });
  const [{ n: txns }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM transactions WHERE clinic_id = @clinicId", { clinicId });
  assert.equal(patients, 2);
  assert.equal(txns, 2);

  const bad = IMAGE_TEXT.replace("Kumar S | 9123456789", "Kumar S | 12345").replace("1,500", "1,500") + "\n";
  await assert.rejects(importFinanceText(db, clinicId, userId, bad + "Income\namount | category\n-5 | Other", { allowPatients: true }), ImportError);
  const [{ n: after }] = await db.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM transactions WHERE clinic_id = @clinicId", { clinicId });
  assert.equal(after, 2);
});

test("a role without patient access cannot add the Patients section", async (t: TestContext) => {
  const db = await freshDb(t);
  const { clinicId, userId } = await registerClinic(db, {
    clinicName: "Harsha Vedic",
    adminName: "Admin",
    email: "admin2@example.com",
    password: "a-long-password",
  });
  await assert.rejects(importFinanceText(db, clinicId, userId, IMAGE_TEXT, { allowPatients: false }), /Your role cannot add patients/);
});
