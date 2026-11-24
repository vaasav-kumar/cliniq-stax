import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { TestContext } from "node:test";
import { ForbiddenError, ValidationError } from "../src/lib/domain";
import type { Database } from "../src/lib/db";
import { hashPassword, verifyPassword } from "../src/lib/password";
import { can, PERMISSIONS } from "../src/lib/rbac";
import { createSession, deleteSession, resolveSession, type SessionUser } from "../src/lib/sessions";
import {
  authenticate,
  changePassword,
  createStaff,
  listStaff,
  registerClinic,
  resetThrottle,
  setStaffActive,
} from "../src/lib/accounts";
import { freshDb } from "./helpers";

const PASSWORD = "correct-horse-battery";

async function actorFor(db: Database, userId: number): Promise<SessionUser> {
  return (await db.one<SessionUser>(
    `SELECT u.id, u.name, u.email, u.role, u.clinic_id AS "clinicId", c.name AS "clinicName"
     FROM users u JOIN clinics c ON c.id = u.clinic_id WHERE u.id = @userId`,
    { userId },
  ))!;
}

beforeEach(() => resetThrottle());

test("passwords are stored hashed and verify correctly", () => {
  const stored = hashPassword(PASSWORD);
  assert.ok(!stored.includes(PASSWORD));
  assert.equal(verifyPassword(PASSWORD, stored), true);
  assert.equal(verifyPassword("wrong-password-here", stored), false);
  assert.equal(verifyPassword(PASSWORD, "not-a-hash"), false);
});

test("two hashes of the same password differ (random salt)", () => {
  assert.notEqual(hashPassword(PASSWORD), hashPassword(PASSWORD));
});

test("registration creates a clinic with an admin and rejects short passwords", async (t: TestContext) => {
  const db = await freshDb(t);
  const { clinicId, userId } = await registerClinic(db, {
    clinicName: "Harsha Vedic",
    adminName: "Dr. A",
    email: "  Admin@Clinic.IN ",
    password: PASSWORD,
  });
  const actor = await actorFor(db, userId);
  assert.equal(actor.role, "admin");
  assert.equal(actor.clinicId, clinicId);
  assert.equal(actor.email, "admin@clinic.in");
  await assert.rejects(
    registerClinic(db, { clinicName: "X", adminName: "Y", email: "other@clinic.in", password: "short" }),
    ValidationError,
  );
});

test("email must be unique across clinics", async (t: TestContext) => {
  const db = await freshDb(t);
  await registerClinic(db, { clinicName: "A", adminName: "A", email: "same@x.in", password: PASSWORD });
  await assert.rejects(
    registerClinic(db, { clinicName: "B", adminName: "B", email: "same@x.in", password: PASSWORD }),
    ValidationError,
  );
});

test("sign-in succeeds with the right password and fails generically otherwise", async (t: TestContext) => {
  const db = await freshDb(t);
  const { clinicId, userId } = await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: PASSWORD });
  assert.deepEqual(await authenticate(db, "a@x.in", PASSWORD), { userId, clinicId });
  await assert.rejects(authenticate(db, "a@x.in", "wrong-password-here"), /Email or password is incorrect/);
  await assert.rejects(authenticate(db, "nobody@x.in", PASSWORD), /Email or password is incorrect/);
});

test("sign-in is locked after 5 failures for 15 minutes", async (t: TestContext) => {
  const db = await freshDb(t);
  await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: PASSWORD });
  const t0 = Date.now();
  for (let i = 0; i < 5; i++) {
    await assert.rejects(authenticate(db, "a@x.in", "wrong-password-here", t0), /Email or password/);
  }
  // Even the correct password is refused while locked.
  await assert.rejects(authenticate(db, "a@x.in", PASSWORD, t0 + 1000), /Too many failed attempts/);
  // After the lock expires the correct password works again.
  assert.ok(await authenticate(db, "a@x.in", PASSWORD, t0 + 16 * 60 * 1000));
});

test("deactivated users cannot sign in or keep a session", async (t: TestContext) => {
  const db = await freshDb(t);
  const admin = await registerClinic(db, { clinicName: "A", adminName: "Admin", email: "admin@x.in", password: PASSWORD });
  const staffId = await createStaff(db, await actorFor(db, admin.userId), {
    name: "Staff",
    email: "staff@x.in",
    role: "front_desk",
    password: PASSWORD,
  });
  const token = await createSession(db, staffId, admin.clinicId);
  assert.ok(await resolveSession(db, token));

  await setStaffActive(db, await actorFor(db, admin.userId), staffId, false);
  assert.equal(await resolveSession(db, token), null);
  await assert.rejects(authenticate(db, "staff@x.in", PASSWORD), /Email or password/);
});

test("sessions expire after their lifetime and can be deleted", async (t: TestContext) => {
  const db = await freshDb(t);
  const { userId, clinicId } = await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: PASSWORD });
  const now = new Date("2026-03-01T10:00:00Z");
  const token = await createSession(db, userId, clinicId, now);
  assert.ok(await resolveSession(db, token, new Date("2026-03-01T21:00:00Z")), "still valid within 12h");
  assert.equal(await resolveSession(db, token, new Date("2026-03-01T22:30:00Z")), null, "expired after 12h");
  const token2 = await createSession(db, userId, clinicId, now);
  await deleteSession(db, token2);
  assert.equal(await resolveSession(db, token2, now), null);
});

test("session tokens are stored only as hashes", async (t: TestContext) => {
  const db = await freshDb(t);
  const { userId, clinicId } = await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: PASSWORD });
  const token = await createSession(db, userId, clinicId);
  const rows = await db.query<{ token_hash: string }>("SELECT token_hash FROM sessions");
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, token);
  assert.equal(rows[0].token_hash.length, 64);
});

test("only admins can add staff", async (t: TestContext) => {
  const db = await freshDb(t);
  const admin = await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: PASSWORD });
  const deskId = await createStaff(db, await actorFor(db, admin.userId), {
    name: "Desk",
    email: "desk@x.in",
    role: "front_desk",
    password: PASSWORD,
  });
  await assert.rejects(
    createStaff(db, await actorFor(db, deskId), { name: "X", email: "x@x.in", role: "doctor", password: PASSWORD }),
    ForbiddenError,
  );
});

test("admins cannot manage staff in another clinic or deactivate themselves", async (t: TestContext) => {
  const db = await freshDb(t);
  const a = await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: PASSWORD });
  const b = await registerClinic(db, { clinicName: "B", adminName: "B", email: "b@x.in", password: PASSWORD });
  const bStaff = await createStaff(db, await actorFor(db, b.userId), { name: "B2", email: "b2@x.in", role: "doctor", password: PASSWORD });
  await assert.rejects(setStaffActive(db, await actorFor(db, a.userId), bStaff, false), ValidationError);
  await assert.rejects(setStaffActive(db, await actorFor(db, a.userId), a.userId, false), ValidationError);
  assert.deepEqual((await listStaff(db, a.clinicId)).map((u) => u.email), ["a@x.in"]);
});

test("changing password signs out other sessions and requires the current password", async (t: TestContext) => {
  const db = await freshDb(t);
  const { userId, clinicId } = await registerClinic(db, { clinicName: "A", adminName: "A", email: "a@x.in", password: PASSWORD });
  const token = await createSession(db, userId, clinicId);
  await assert.rejects(changePassword(db, userId, "not-my-password", "brand-new-password-1"), /Current password is incorrect/);
  await changePassword(db, userId, PASSWORD, "brand-new-password-1");
  assert.equal(await resolveSession(db, token), null);
  assert.ok(await authenticate(db, "a@x.in", "brand-new-password-1"));
});

test("role permissions match the agreed matrix", () => {
  assert.ok(PERMISSIONS.length >= 8);
  for (const p of PERMISSIONS) assert.equal(can("admin", p), true, `admin ${p}`);
  assert.equal(can("doctor", "patients:write"), true);
  assert.equal(can("doctor", "visits:write"), true);
  assert.equal(can("doctor", "finance:read"), false);
  assert.equal(can("doctor", "dashboard:view"), false);
  assert.equal(can("doctor", "staff:manage"), false);
  assert.equal(can("front_desk", "finance:write"), true);
  assert.equal(can("front_desk", "dashboard:view"), false);
  assert.equal(can("front_desk", "staff:manage"), false);
});
