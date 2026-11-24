import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { Database } from "../src/lib/db";
import { ValidationError, normalizePhone, requireDate, todayIso } from "../src/lib/domain";
import { registerClinic } from "../src/lib/accounts";
import {
  buildDashboard,
  createPatient,
  createTransaction,
  createVisit,
  dueFollowUps,
  getPatient,
  listPatients,
  listTransactions,
  listUnpaidVisits,
  listVisitsForPatient,
  markFollowUpDone,
  monthRange,
  setVisitPaymentStatus,
} from "../src/lib/repo";
import { freshDb } from "./helpers";

// Creates a clinic (with its own admin) and returns its id.
async function clinic(db: Database, name: string, email: string): Promise<number> {
  return (await registerClinic(db, { clinicName: name, adminName: "Admin", email, password: "a-long-password" })).clinicId;
}

const basePatient = {
  name: "Lakshmi R",
  phone: "+91 98400 12345",
  reachedVia: "Instagram",
  area: "Medavakkam",
  addressLine: "12, 3rd Cross Street",
  pincode: "600100",
};

async function incomeTotal(db: Database, c: number): Promise<number> {
  const rows = await listTransactions(db, c, { from: "2000-01-01", to: "2100-01-01" });
  return rows.filter((r) => r.kind === "income").reduce((s, r) => s + r.amount, 0);
}

test("phone normalisation accepts Indian mobile formats and rejects junk", () => {
  assert.equal(normalizePhone("+91 98400 12345"), "9840012345");
  assert.equal(normalizePhone("098400-12345"), "9840012345");
  assert.equal(normalizePhone("9123456789"), "9123456789", "a 10-digit number starting 91 is kept whole");
  assert.throws(() => normalizePhone("12345"), ValidationError);
  assert.throws(() => normalizePhone("1234567890"), ValidationError);
});

test("dates must be real calendar dates", () => {
  assert.equal(requireDate("2026-02-28", "d"), "2026-02-28");
  assert.throws(() => requireDate("2026-02-30", "d"), ValidationError);
  assert.throws(() => requireDate("28/02/2026", "d"), ValidationError);
});

test("patient stores details, address and reach-out source", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  const id = await createPatient(db, c, basePatient);
  const p = (await getPatient(db, c, id))!;
  assert.equal(p.name, "Lakshmi R");
  assert.equal(p.phone, "9840012345");
  assert.equal(p.reached_via, "Instagram");
  assert.equal(p.area, "Medavakkam");
  assert.equal(p.address_line, "12, 3rd Cross Street");
  assert.equal(p.city, "Chennai");
});

test("reach-out source must be one of the allowed sources", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  await assert.rejects(createPatient(db, c, { ...basePatient, reachedVia: "Billboard" }), ValidationError);
  await assert.rejects(createPatient(db, c, { ...basePatient, reachedVia: undefined }), ValidationError);
});

test("patient list filters by search text and by source", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  await createPatient(db, c, basePatient);
  await createPatient(db, c, { ...basePatient, name: "Kumar S", phone: "9123456789", reachedVia: "Google Search" });
  assert.equal((await listPatients(db, c, { q: "kumar" })).length, 1);
  assert.equal((await listPatients(db, c, { q: "9840012345" })).length, 1);
  assert.equal((await listPatients(db, c, { source: "Google Search" })).length, 1);
  assert.equal((await listPatients(db, c, {})).length, 2);
});

test("visits count toward repeat patients", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  const id = await createPatient(db, c, basePatient);
  await createVisit(db, c, { patientId: id, visitDate: "2026-03-01", service: "Kerala Panchakarma", fee: 3000 });
  await createVisit(db, c, { patientId: id, visitDate: "2026-03-05", service: "Pain care", fee: 800 });
  assert.equal((await listVisitsForPatient(db, c, id)).length, 2);
  const dash = await buildDashboard(db, c, { from: "2026-01-01", to: "2026-12-31" });
  assert.equal(dash.totals.visits, 2);
  assert.equal(dash.totals.repeatPatients, 1);
});

test("a new visit is NOT_PAID by default and PAID visits book their fee as income", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  const id = await createPatient(db, c, basePatient);
  const unpaid = await createVisit(db, c, { patientId: id, visitDate: "2026-03-01", service: "Pain care", fee: 1000 });
  const paid = await createVisit(db, c, {
    patientId: id,
    visitDate: "2026-03-02",
    service: "Kerala Panchakarma",
    fee: 3000,
    paymentStatus: "PAID",
  });
  const visits = await listVisitsForPatient(db, c, id);
  assert.equal(visits.find((v) => v.id === unpaid)?.payment_status, "NOT_PAID");
  assert.equal(visits.find((v) => v.id === paid)?.payment_status, "PAID");
  assert.equal(await incomeTotal(db, c), 3000, "only the PAID visit is income");
});

test("marking a visit PAID books income once, and NOT_PAID removes it again", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  const id = await createPatient(db, c, basePatient);
  const visitId = await createVisit(db, c, { patientId: id, visitDate: "2026-03-01", service: "Pain care", fee: 800 });
  assert.equal(await incomeTotal(db, c), 0);

  assert.equal(await setVisitPaymentStatus(db, c, visitId, "PAID"), true);
  assert.equal(await incomeTotal(db, c), 800);

  // Marking PAID again must not double the income.
  assert.equal(await setVisitPaymentStatus(db, c, visitId, "PAID"), true);
  assert.equal(await incomeTotal(db, c), 800);

  assert.equal(await setVisitPaymentStatus(db, c, visitId, "NOT_PAID"), true);
  assert.equal(await incomeTotal(db, c), 0);
  const v = (await listVisitsForPatient(db, c, id))[0];
  assert.equal(v.payment_status, "NOT_PAID");
  assert.equal(v.paid_at, null);
});

test("payment status must be PAID or NOT_PAID", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  const id = await createPatient(db, c, basePatient);
  const visitId = await createVisit(db, c, { patientId: id, visitDate: "2026-03-01", service: "Pain care", fee: 800 });
  await assert.rejects(setVisitPaymentStatus(db, c, visitId, "paid"), ValidationError);
  await assert.rejects(setVisitPaymentStatus(db, c, visitId, "PARTIAL"), ValidationError);
});

test("unpaid visits list and dashboard unpaid total reflect NOT_PAID visits with a fee", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  const id = await createPatient(db, c, basePatient);
  await createVisit(db, c, { patientId: id, visitDate: "2026-03-01", service: "Pain care", fee: 800 });
  const second = await createVisit(db, c, { patientId: id, visitDate: "2026-03-02", service: "Pain care", fee: 1200 });
  await createVisit(db, c, { patientId: id, visitDate: "2026-03-03", service: "Pain care", fee: 0 });
  await setVisitPaymentStatus(db, c, second, "PAID");

  const unpaid = await listUnpaidVisits(db, c);
  assert.equal(unpaid.length, 1, "free visits and paid visits are not outstanding");
  assert.equal(unpaid[0].fee, 800);
  const dash = await buildDashboard(db, c, { from: "2026-03-01", to: "2026-03-31" });
  assert.equal(dash.totals.unpaid, 800);
  assert.equal(dash.totals.income, 1200);
});

test("one clinic cannot mark another clinic's visit as paid", async (t: TestContext) => {
  const db = await freshDb(t);
  const a = await clinic(db, "Clinic A", "a@x.in");
  const b = await clinic(db, "Clinic B", "b@x.in");
  const pa = await createPatient(db, a, basePatient);
  const visitA = await createVisit(db, a, { patientId: pa, visitDate: "2026-03-01", service: "Pain care", fee: 800 });
  assert.equal(await setVisitPaymentStatus(db, b, visitA, "PAID"), false);
  assert.equal(await incomeTotal(db, a), 0);
  assert.equal((await listUnpaidVisits(db, b)).length, 0);
});

test("amount cannot be negative and visit needs a valid service", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  const id = await createPatient(db, c, basePatient);
  await assert.rejects(createVisit(db, c, { patientId: id, visitDate: "2026-03-01", service: "Pain care", fee: -5 }), ValidationError);
  await assert.rejects(createVisit(db, c, { patientId: id, visitDate: "2026-03-01", service: "Massage", fee: 5 }), ValidationError);
});

test("follow-ups show when due and disappear once marked done", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  const id = await createPatient(db, c, basePatient);
  const visitId = await createVisit(db, c, {
    patientId: id,
    visitDate: "2026-03-01",
    service: "Women's health",
    fee: 500,
    followUpDate: "2026-03-10",
  });
  assert.equal((await dueFollowUps(db, c, "2026-03-09")).length, 0);
  assert.equal((await dueFollowUps(db, c, "2026-03-10")).length, 1);
  await markFollowUpDone(db, c, visitId);
  assert.equal((await dueFollowUps(db, c, "2026-03-20")).length, 0);
});

test("expenses reduce net and category must match the kind", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  await createTransaction(db, c, { kind: "expense", amount: 15000, category: "Rent", entryDate: "2026-04-01" });
  await createTransaction(db, c, { kind: "income", amount: 20000, category: "Consultation", entryDate: "2026-04-02" });
  const dash = await buildDashboard(db, c, { from: "2026-04-01", to: "2026-04-30" });
  assert.equal(dash.totals.expense, 15000);
  assert.equal(dash.totals.income, 20000);
  assert.equal(dash.totals.net, 5000);
  await assert.rejects(createTransaction(db, c, { kind: "expense", amount: 10, category: "Consultation", entryDate: "2026-04-03" }), ValidationError);
  await assert.rejects(createTransaction(db, c, { kind: "income", amount: -5, category: "Other", entryDate: "2026-04-03" }), ValidationError);
});

test("monthly series has no gaps so charts line up", async (t: TestContext) => {
  assert.deepEqual(monthRange("2025-11-15", "2026-02-01"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  await createTransaction(db, c, { kind: "income", amount: 100, category: "Other", entryDate: "2026-01-10" });
  const dash = await buildDashboard(db, c, { from: "2025-11-01", to: "2026-02-28" });
  assert.equal(dash.monthly.length, 4);
  assert.equal(dash.monthly.find((m) => m.month === "2026-01")?.income, 100);
  assert.equal(dash.monthly.find((m) => m.month === "2025-12")?.income, 0);
});

test("reach-out sources are reported in the dashboard", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  const today = todayIso();
  await createPatient(db, c, basePatient);
  await createPatient(db, c, { ...basePatient, name: "B", phone: "9000000001", reachedVia: "Walk-in" });
  await createPatient(db, c, { ...basePatient, name: "C", phone: "9000000002", reachedVia: "Walk-in" });
  const dash = await buildDashboard(db, c, { from: today, to: today });
  assert.equal(dash.bySource.find((s) => s.source === "Walk-in")?.patients, 2);
  assert.equal(dash.totals.patients, 3);
});

test("new patients are charted by registration date, not by when they were typed in", async (t: TestContext) => {
  const db = await freshDb(t);
  const c = await clinic(db, "A", "a@x.in");
  await createPatient(db, c, { ...basePatient, registeredOn: "2026-01-15" });
  await createPatient(db, c, { ...basePatient, name: "Old", phone: "9000000009", registeredOn: "2026-01-20" });
  const dash = await buildDashboard(db, c, { from: "2026-01-01", to: "2026-01-31" });
  assert.equal(dash.totals.patients, 2);
  assert.equal(dash.monthly.find((m) => m.month === "2026-01")?.newPatients, 2);
});

test("todayIso uses India date", () => {
  // 2026-03-01 20:00 UTC is 2026-03-02 01:30 IST
  assert.equal(todayIso(new Date("2026-03-01T20:00:00Z")), "2026-03-02");
});

// ---- Clinic isolation: the core multi-tenant guarantee ----

test("one clinic cannot read another clinic's patients", async (t: TestContext) => {
  const db = await freshDb(t);
  const a = await clinic(db, "Clinic A", "a@x.in");
  const b = await clinic(db, "Clinic B", "b@x.in");
  const patientA = await createPatient(db, a, basePatient);
  assert.equal(await getPatient(db, b, patientA), undefined);
  assert.equal((await listPatients(db, b, {})).length, 0);
});

test("one clinic cannot add a visit to another clinic's patient", async (t: TestContext) => {
  const db = await freshDb(t);
  const a = await clinic(db, "Clinic A", "a@x.in");
  const b = await clinic(db, "Clinic B", "b@x.in");
  const patientA = await createPatient(db, a, basePatient);
  await assert.rejects(
    createVisit(db, b, { patientId: patientA, visitDate: "2026-03-01", service: "Pain care", fee: 500 }),
    /Patient not found/,
  );
  assert.equal((await listVisitsForPatient(db, a, patientA)).length, 0);
});

test("one clinic cannot see or close another clinic's follow-ups", async (t: TestContext) => {
  const db = await freshDb(t);
  const a = await clinic(db, "Clinic A", "a@x.in");
  const b = await clinic(db, "Clinic B", "b@x.in");
  const pa = await createPatient(db, a, basePatient);
  const visitA = await createVisit(db, a, {
    patientId: pa,
    visitDate: "2026-03-01",
    service: "Pain care",
    fee: 500,
    followUpDate: "2026-03-05",
  });
  assert.equal((await dueFollowUps(db, b, "2026-03-31")).length, 0);
  await markFollowUpDone(db, b, visitA); // does nothing for clinic B
  assert.equal((await dueFollowUps(db, a, "2026-03-31")).length, 1);
});

test("dashboards and ledgers only include the clinic's own money and patients", async (t: TestContext) => {
  const db = await freshDb(t);
  const a = await clinic(db, "Clinic A", "a@x.in");
  const b = await clinic(db, "Clinic B", "b@x.in");
  const pa = await createPatient(db, a, { ...basePatient, registeredOn: "2026-05-10" });
  const visitA = await createVisit(db, a, { patientId: pa, visitDate: "2026-05-11", service: "Pain care", fee: 1000 });
  await setVisitPaymentStatus(db, a, visitA, "PAID");
  await createTransaction(db, a, { kind: "expense", amount: 500, category: "Rent", entryDate: "2026-05-01" });
  await createPatient(db, b, { ...basePatient, name: "Other", phone: "9000000007", registeredOn: "2026-05-10" });

  const period = { from: "2026-05-01", to: "2026-05-31" };
  const dashB = await buildDashboard(db, b, period);
  assert.equal(dashB.totals.income, 0);
  assert.equal(dashB.totals.expense, 0);
  assert.equal(dashB.totals.patients, 1, "only clinic B's own patient");
  assert.equal((await listTransactions(db, b, period)).length, 0);

  const dashA = await buildDashboard(db, a, period);
  assert.equal(dashA.totals.income, 1000);
  assert.equal(dashA.totals.patients, 1);
});
