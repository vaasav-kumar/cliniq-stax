import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "../src/lib/db";
import { ValidationError } from "../src/lib/domain";
import { registerClinic } from "../src/lib/accounts";
import { createPatient, buildDashboard } from "../src/lib/repo";
import {
  cancelRequest,
  createRequest,
  dispenseRequest,
  listMedicines,
  nextBatch,
  recordPurchase,
} from "../src/lib/medicines";
import { ImportError } from "../src/lib/import";
import { importMedicines, tableToMedicineRows } from "../src/lib/medicine-import";
import { freshDb } from "./helpers";

async function setup(t: TestContext) {
  const db = await freshDb(t);
  const { clinicId, userId } = await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: "a-long-password" });
  const patientId = await createPatient(db, clinicId, { name: "Lakshmi", phone: "9840012345", reachedVia: "Walk-in" });
  return { db, clinicId, userId, patientId };
}

async function stockOf(db: Database, clinicId: number, name: string): Promise<number> {
  const m = (await listMedicines(db, clinicId)).find((x) => x.name === name);
  return m?.stock_qty ?? -1;
}

async function expenseTotal(db: Database, clinicId: number): Promise<number> {
  const rows = await db.query<{ total: number }>(
    "SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE clinic_id = @clinicId AND kind = 'expense' AND category = 'Medicines & herbs'",
    { clinicId },
  );
  return rows[0].total;
}

test("a purchase adds stock and books the cost as a Medicines & herbs expense", async (t: TestContext) => {
  const { db, clinicId, userId } = await setup(t);
  await recordPurchase(db, clinicId, userId, { name: "Triphala", unit: "tablets", quantity: 120, unitCost: 1.2, purchaseDate: "2026-11-01" });
  assert.equal(await stockOf(db, clinicId, "Triphala"), 120);
  assert.equal(await expenseTotal(db, clinicId), 144);
  const dash = await buildDashboard(db, clinicId, { from: "2026-11-01", to: "2026-11-30" });
  assert.equal(dash.totals.expense, 144);
  assert.deepEqual(dash.expenseByCategory, [{ category: "Medicines & herbs", amount: 144 }]);
});

test("buying more of the same medicine adds to its stock, ignoring case", async (t: TestContext) => {
  const { db, clinicId, userId } = await setup(t);
  await recordPurchase(db, clinicId, userId, { name: "Brahmi oil", quantity: 5, unitCost: 100 });
  await recordPurchase(db, clinicId, userId, { name: "brahmi OIL", quantity: 3, unitCost: 100 });
  assert.equal((await listMedicines(db, clinicId)).length, 1);
  assert.equal(await stockOf(db, clinicId, "Brahmi oil"), 8);
  assert.equal(await expenseTotal(db, clinicId), 800);
});

test("a zero-cost purchase adds stock but books no expense", async (t: TestContext) => {
  const { db, clinicId, userId } = await setup(t);
  await recordPurchase(db, clinicId, userId, { name: "Donated herb", quantity: 2, unitCost: 0 });
  assert.equal(await stockOf(db, clinicId, "Donated herb"), 2);
  assert.equal(await expenseTotal(db, clinicId), 0);
});

test("a patient request is handed over: stock goes down and the request closes", async (t: TestContext) => {
  const { db, clinicId, userId, patientId } = await setup(t);
  await recordPurchase(db, clinicId, userId, { name: "Ashwagandha", unit: "g", quantity: 100, unitCost: 4 });
  const medId = (await listMedicines(db, clinicId))[0].id;
  const reqId = await createRequest(db, clinicId, { patientId, medicineId: medId, quantity: 30 });
  await dispenseRequest(db, clinicId, userId, reqId);
  assert.equal(await stockOf(db, clinicId, "Ashwagandha"), 70);
  await assert.rejects(dispenseRequest(db, clinicId, userId, reqId), /already closed/);
  assert.equal(await stockOf(db, clinicId, "Ashwagandha"), 70, "a second hand-over changes nothing");
});

test("handing over more than the stock fails and changes nothing", async (t: TestContext) => {
  const { db, clinicId, userId, patientId } = await setup(t);
  await recordPurchase(db, clinicId, userId, { name: "Dashamoola", quantity: 2, unitCost: 140 });
  const medId = (await listMedicines(db, clinicId))[0].id;
  const reqId = await createRequest(db, clinicId, { patientId, medicineId: medId, quantity: 5 });
  await assert.rejects(dispenseRequest(db, clinicId, userId, reqId), /Only 2 unit of Dashamoola in stock, 5 needed/);
  assert.equal(await stockOf(db, clinicId, "Dashamoola"), 2);
});

test("next batch lists what patients asked for beyond stock, plus low-stock items", async (t: TestContext) => {
  const { db, clinicId, userId, patientId } = await setup(t);
  await recordPurchase(db, clinicId, userId, { name: "Shallaki", quantity: 4, unitCost: 10, reorderLevel: 10 });
  await recordPurchase(db, clinicId, userId, { name: "Triphala", quantity: 50, unitCost: 1, reorderLevel: 20 });
  const shallaki = (await listMedicines(db, clinicId)).find((m) => m.name === "Shallaki")!;
  const triphala = (await listMedicines(db, clinicId)).find((m) => m.name === "Triphala")!;
  await createRequest(db, clinicId, { patientId, medicineId: shallaki.id, quantity: 9 });

  const batch = await nextBatch(db, clinicId);
  const sh = batch.find((b) => b.name === "Shallaki")!;
  const tr = batch.find((b) => b.name === "Triphala");
  // 9 asked, 4 in stock: 5 short for patients. Reorder level 10: 6 short. The larger shortfall wins.
  assert.equal(sh.to_order, 6);
  assert.equal(tr, undefined, "Triphala is above its reorder level and nothing is asked for it");
  assert.deepEqual(sh.patients, ["Lakshmi"]);
  assert.ok(triphala);
});

test("a cancelled request drops off the next batch list", async (t: TestContext) => {
  const { db, clinicId, userId, patientId } = await setup(t);
  await recordPurchase(db, clinicId, userId, { name: "Brahmi oil", quantity: 1, unitCost: 185 });
  const medId = (await listMedicines(db, clinicId))[0].id;
  const reqId = await createRequest(db, clinicId, { patientId, medicineId: medId, quantity: 3 });
  assert.equal((await nextBatch(db, clinicId)).length, 1);
  await cancelRequest(db, clinicId, userId, reqId);
  assert.equal((await nextBatch(db, clinicId)).length, 0);
});

test("medicine import reports every bad row and saves nothing", async (t: TestContext) => {
  const { db, clinicId, userId } = await setup(t);
  const table = [
    ["name", "quantity", "unit", "unit_cost"],
    ["Triphala", "120", "tablets", "1.2"],
    ["Brahmi oil", "5", "bottles", ""],
    ["", "2", "g", "10"],
  ];
  assert.throws(() => tableToMedicineRows(table), (e: unknown) => e instanceof ImportError && (e as ImportError).errors.map((x) => x.row).join() === "3,4");
  await assert.rejects(importMedicines(db, clinicId, userId, table));
  assert.equal((await listMedicines(db, clinicId)).length, 0);
});

test("medicine import with valid rows adds stock and expenses for rows with a quantity", async (t: TestContext) => {
  const { db, clinicId, userId } = await setup(t);
  const table = [
    ["name", "quantity", "unit", "unit_cost", "reorder_level"],
    ["Triphala", "120", "tablets", "1.2", "100"],
    ["Ashwagandha", "40", "g", "4.5", "500"],
    ["Shallaki capsules", "", "capsules", "", "50"],
  ];
  assert.equal(await importMedicines(db, clinicId, userId, table), 3);
  assert.equal(await stockOf(db, clinicId, "Triphala"), 120);
  assert.equal(await stockOf(db, clinicId, "Shallaki capsules"), 0);
  assert.equal(await expenseTotal(db, clinicId), 144 + 180);
});

test("another clinic cannot see, request, or hand over this clinic's medicines", async (t: TestContext) => {
  const { db, clinicId, userId, patientId } = await setup(t);
  const other = await registerClinic(db, { clinicName: "B", adminName: "B", email: "b@x.in", password: "a-long-password" });
  await recordPurchase(db, clinicId, userId, { name: "Triphala", quantity: 10, unitCost: 1 });
  const medId = (await listMedicines(db, clinicId))[0].id;
  assert.equal((await listMedicines(db, other.clinicId)).length, 0);
  await assert.rejects(createRequest(db, other.clinicId, { patientId, medicineId: medId, quantity: 1 }), /Patient not found/);
  const reqId = await createRequest(db, clinicId, { patientId, medicineId: medId, quantity: 1 });
  await assert.rejects(dispenseRequest(db, other.clinicId, other.userId, reqId), /Request not found/);
  assert.equal(await stockOf(db, clinicId, "Triphala"), 10);
});

test("quantities must be positive numbers", async (t: TestContext) => {
  const { db, clinicId, userId } = await setup(t);
  await assert.rejects(recordPurchase(db, clinicId, userId, { name: "X", quantity: 0, unitCost: 1 }), ValidationError);
  await assert.rejects(recordPurchase(db, clinicId, userId, { name: "X", quantity: "abc", unitCost: 1 }), ValidationError);
});
