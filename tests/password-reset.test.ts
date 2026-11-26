import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ValidationError } from "../src/lib/domain";
import { verifyPassword } from "../src/lib/password";
import { authenticate, registerClinic, resetThrottle } from "../src/lib/accounts";
import { createSession, resolveSession } from "../src/lib/sessions";
import { createPasswordReset, resetPasswordWithToken, RESET_TTL_MINUTES } from "../src/lib/password-reset";
import { freshDb } from "./helpers";

const OLD = "old-password-1234";
const NEW = "new-password-5678";
const EMAIL = "admin@clinic.test";

beforeEach(() => resetThrottle());

test("a reset link sets the new password once and signs the account out", async (t) => {
  const db = await freshDb(t);
  const { userId, clinicId } = await registerClinic(db, { clinicName: "Clinic", adminName: "Admin", email: EMAIL, password: OLD });
  const session = await createSession(db, userId, clinicId);
  assert.ok(await resolveSession(db, session));

  const reset = await createPasswordReset(db, EMAIL);
  assert.ok(reset);
  await resetPasswordWithToken(db, reset.token, NEW);

  const row = await db.one<{ passwordHash: string }>("SELECT password_hash AS \"passwordHash\" FROM users WHERE id = @userId", { userId });
  assert.equal(verifyPassword(NEW, row!.passwordHash), true);
  assert.equal(verifyPassword(OLD, row!.passwordHash), false);
  assert.equal(await resolveSession(db, session), null);
  await assert.doesNotReject(authenticate(db, EMAIL, NEW));

  await assert.rejects(resetPasswordWithToken(db, reset.token, "another-password-9"), ValidationError);
});

test("a reset link cannot be used after it expires", async (t) => {
  const db = await freshDb(t);
  await registerClinic(db, { clinicName: "Clinic", adminName: "Admin", email: EMAIL, password: OLD });
  const issuedAt = new Date("2026-01-01T10:00:00Z");
  const reset = await createPasswordReset(db, EMAIL, issuedAt);
  assert.ok(reset);
  const later = new Date(issuedAt.getTime() + (RESET_TTL_MINUTES + 1) * 60 * 1000);
  await assert.rejects(resetPasswordWithToken(db, reset.token, NEW, later), ValidationError);
});

test("requesting a new link invalidates the older one", async (t) => {
  const db = await freshDb(t);
  await registerClinic(db, { clinicName: "Clinic", adminName: "Admin", email: EMAIL, password: OLD });
  const first = await createPasswordReset(db, EMAIL);
  const second = await createPasswordReset(db, EMAIL);
  assert.ok(first && second);
  await assert.rejects(resetPasswordWithToken(db, first.token, NEW), ValidationError);
  await assert.doesNotReject(resetPasswordWithToken(db, second.token, NEW));
});

test("an unknown email gets no link and no error", async (t) => {
  const db = await freshDb(t);
  assert.equal(await createPasswordReset(db, "nobody@clinic.test"), null);
  assert.equal(await createPasswordReset(db, "not-an-email"), null);
});

test("a made-up token is rejected and a short new password is refused", async (t) => {
  const db = await freshDb(t);
  await registerClinic(db, { clinicName: "Clinic", adminName: "Admin", email: EMAIL, password: OLD });
  const reset = await createPasswordReset(db, EMAIL);
  assert.ok(reset);
  await assert.rejects(resetPasswordWithToken(db, "guessed-token", NEW), ValidationError);
  await assert.rejects(resetPasswordWithToken(db, reset.token, "short"), ValidationError);
  await assert.doesNotReject(resetPasswordWithToken(db, reset.token, NEW));
});
