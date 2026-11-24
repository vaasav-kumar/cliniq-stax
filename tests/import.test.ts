import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { registerClinic } from "../src/lib/accounts";
import { findDuplicatePhones, ImportError, ocrTextToTable, parseCsv, tableToPatientInputs } from "../src/lib/import";
import { importPatients } from "../src/lib/import-service";
import { createPatient } from "../src/lib/repo";
import { freshDb } from "./helpers";

const SAMPLE = path.join(process.cwd(), "public", "samples", "patients-sample.csv");

function errorsOf(fn: () => unknown): { row: number; message: string }[] {
  try {
    fn();
  } catch (e) {
    if (e instanceof ImportError) return e.errors;
    throw e;
  }
  assert.fail("expected an ImportError");
}

test("CSV parser handles quotes, commas inside fields, CRLF and a byte-order mark", () => {
  const text = '﻿name,notes\r\n"Lakshmi, R","said ""hello"""\r\nKumar,\r\n';
  assert.deepEqual(parseCsv(text), [
    ["name", "notes"],
    ["Lakshmi, R", 'said "hello"'],
    ["Kumar", ""],
  ]);
});

test("the shipped sample CSV is valid and imports five patients", () => {
  const table = parseCsv(fs.readFileSync(SAMPLE, "utf8"));
  const inputs = tableToPatientInputs(table);
  assert.equal(inputs.length, 5);
  assert.deepEqual(findDuplicatePhones(inputs), []);
});

test("every problem is reported with its row number, not just the first", () => {
  const table = [
    ["name", "phone", "reached_via"],
    ["Good One", "9840012345", "Instagram"],
    ["", "9840012346", "Instagram"],
    ["Bad Phone", "12345", "Instagram"],
    ["Bad Source", "9840012347", "Billboard"],
  ];
  const errors = errorsOf(() => tableToPatientInputs(table));
  assert.deepEqual(errors.map((e) => e.row), [3, 4, 5]);
  assert.match(errors[0].message, /Name is required/);
  assert.match(errors[1].message, /10-digit/);
  assert.match(errors[2].message, /reached out from/);
});

test("unknown or missing columns are rejected before any row is read", () => {
  const unknown = errorsOf(() => tableToPatientInputs([["name", "phone", "reached_via", "shoe_size"], ["A", "9840012345", "Other", "9"]]));
  assert.match(unknown[0].message, /Unknown column "shoe_size"/);
  const missing = errorsOf(() => tableToPatientInputs([["name", "phone"], ["A", "9840012345"]]));
  assert.match(missing.map((e) => e.message).join(" "), /reachedVia/);
});

test("a file with no patients is rejected", () => {
  const errors = errorsOf(() => tableToPatientInputs([["name", "phone", "reached_via"]]));
  assert.match(errors[0].message, /at least one patient/);
});

test("duplicate phones inside the file are reported on the later row", () => {
  const table = [
    ["name", "phone", "reached_via"],
    ["A", "9840012345", "Instagram"],
    ["B", "+91 98400 12345", "Walk-in"],
  ];
  const dups = findDuplicatePhones(tableToPatientInputs(table));
  assert.equal(dups.length, 1);
  assert.equal(dups[0].row, 3);
});

test("OCR text is split into columns by tab, pipe, comma or wide spacing", () => {
  const text = "name\tphone\treached_via\nLakshmi R | 9840012345 | Instagram\nKumar S,9123456789,Walk-in\nPriya M    9003412277    Website\n";
  assert.deepEqual(ocrTextToTable(text), [
    ["name", "phone", "reached_via"],
    ["Lakshmi R", "9840012345", "Instagram"],
    ["Kumar S", "9123456789", "Walk-in"],
    ["Priya M", "9003412277", "Website"],
  ]);
});

test("bulk import saves every patient when all rows are valid", async (t: TestContext) => {
  const db = await freshDb(t);
  const { clinicId, userId } = await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: "a-long-password" });
  const table = parseCsv(fs.readFileSync(SAMPLE, "utf8"));
  assert.equal(await importPatients(db, clinicId, userId, table), 5);
  const count = await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM patients WHERE clinic_id = @clinicId", { clinicId });
  assert.equal(count?.n, 5);
});

test("bulk import saves nothing when one row is wrong or its phone already exists", async (t: TestContext) => {
  const db = await freshDb(t);
  const { clinicId, userId } = await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: "a-long-password" });
  await createPatient(db, clinicId, { name: "Existing", phone: "9000000001", reachedVia: "Walk-in" });

  const table = [
    ["name", "phone", "reached_via"],
    ["New One", "9000000002", "Walk-in"],
    ["Clash", "9000000001", "Walk-in"],
  ];
  const errors = await importPatients(db, clinicId, userId, table).catch((e) => e);
  assert.ok(errors instanceof ImportError);
  assert.deepEqual(errors.errors.map((e: { row: number }) => e.row), [3]);

  const count = await db.one<{ n: number }>("SELECT COUNT(*) AS n FROM patients WHERE clinic_id = @clinicId", { clinicId });
  assert.equal(count?.n, 1, "the valid row in the same file was not saved");
});
