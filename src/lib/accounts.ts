import type { Database } from "./db";
import {
  ForbiddenError,
  ROLES,
  type Role,
  ValidationError,
  normalizeEmail,
  optionalText,
  requireOption,
  requirePassword,
  requireText,
} from "./domain";
import { hashPassword, verifyPassword } from "./password";
import { recordAudit } from "./audit";
import { deleteUserSessions, type SessionUser } from "./sessions";

// Sign-in throttling. In-memory: resets on server restart. Fine for one server instance.
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; lockedUntil: number }>();

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const LOGO_MAX_BYTES = 512 * 1024;

export function resetThrottle(): void {
  failures.clear();
}

// Clears the sign-in lock for one email, e.g. after a successful password reset.
export function clearFailures(email: string): void {
  failures.delete(email);
}

export async function registerClinic(
  db: Database,
  input: {
    clinicName: unknown;
    city?: unknown;
    adminName: unknown;
    email: unknown;
    password: unknown;
    logo?: { mime: string; data: Buffer } | null;
  },
): Promise<{ clinicId: number; userId: number }> {
  const clinicName = requireText(input.clinicName, "Clinic name", 120);
  const city = optionalText(input.city, 100);
  const adminName = requireText(input.adminName, "Your name", 120);
  const email = normalizeEmail(input.email);
  const password = requirePassword(input.password);
  const passwordHash = hashPassword(password);

  return db.tx(async (tx) => {
    const exists = await tx.one("SELECT 1 FROM users WHERE email = @email", { email });
    if (exists) throw new ValidationError("An account with this email already exists");
    if (input.logo && !LOGO_TYPES.includes(input.logo.mime)) throw new ValidationError("Logo must be a PNG, JPEG or WebP image");
    if (input.logo && input.logo.data.length > LOGO_MAX_BYTES) throw new ValidationError("Logo must be 512 KB or smaller");
    const clinic = await tx.one<{ id: number }>(
      "INSERT INTO clinics (name, city, logo_mime, logo_data) VALUES (@name, @city, @mime, @data) RETURNING id",
      { name: clinicName, city: city ?? "Chennai", mime: input.logo?.mime ?? null, data: input.logo?.data ?? null },
    );
    const user = await tx.one<{ id: number }>(
      `INSERT INTO users (clinic_id, name, email, password_hash, role)
       VALUES (@clinicId, @name, @email, @hash, 'admin') RETURNING id`,
      { clinicId: clinic!.id, name: adminName, email, hash: passwordHash },
    );
    await recordAudit(tx, clinic!.id, user!.id, "clinic.registered", clinicName);
    return { clinicId: clinic!.id, userId: user!.id };
  });
}

// Returns the user id and clinic id for valid credentials. Errors never say which part was wrong.
export async function authenticate(
  db: Database,
  emailInput: unknown,
  password: unknown,
  now: number = Date.now(),
): Promise<{ userId: number; clinicId: number }> {
  const generic = new ValidationError("Email or password is incorrect");
  let email: string;
  try {
    email = normalizeEmail(emailInput);
  } catch {
    throw generic;
  }
  if (typeof password !== "string" || password.length === 0) throw generic;

  const state = failures.get(email);
  if (state && state.lockedUntil > now) {
    throw new ValidationError("Too many failed attempts. Try again in 15 minutes.");
  }

  const user = await db.one<{ id: number; clinicId: number; passwordHash: string; active: boolean }>(
    `SELECT id, clinic_id AS "clinicId", password_hash AS "passwordHash", active FROM users WHERE email = @email`,
    { email },
  );

  // Always run one hash check so response time does not reveal whether the email exists.
  let ok = false;
  if (user) {
    ok = verifyPassword(password, user.passwordHash);
  } else {
    verifyPassword(password, DUMMY_HASH);
  }

  if (!user || !ok || !user.active) {
    const next = { count: (state?.count ?? 0) + 1, lockedUntil: 0 };
    if (next.count >= MAX_FAILURES) next.lockedUntil = now + LOCK_MS;
    failures.set(email, next);
    throw generic;
  }

  failures.delete(email);
  return { userId: user.id, clinicId: user.clinicId };
}

// Hash computed once; used only to equalise timing for unknown emails.
const DUMMY_HASH = hashPassword("dummy-password-for-timing-only");

function requireAdmin(actor: SessionUser): void {
  if (actor.role !== "admin") throw new ForbiddenError("Only an admin can do this");
}

export async function listStaff(db: Database, clinicId: number) {
  return db.query<{ id: number; name: string; email: string; role: Role; active: boolean; created_at: string }>(
    "SELECT id, name, email, role, active, created_at FROM users WHERE clinic_id = @clinicId ORDER BY active DESC, name",
    { clinicId },
  );
}

export async function createStaff(
  db: Database,
  actor: SessionUser,
  input: { name: unknown; email: unknown; role: unknown; password: unknown },
): Promise<number> {
  requireAdmin(actor);
  const name = requireText(input.name, "Name", 120);
  const email = normalizeEmail(input.email);
  const role = requireOption(input.role, ROLES, "Role");
  const passwordHash = hashPassword(requirePassword(input.password));
  return db.tx(async (tx) => {
    if (await tx.one("SELECT 1 FROM users WHERE email = @email", { email })) {
      throw new ValidationError("An account with this email already exists");
    }
    const row = await tx.one<{ id: number }>(
      `INSERT INTO users (clinic_id, name, email, password_hash, role)
       VALUES (@clinicId, @name, @email, @hash, @role) RETURNING id`,
      { clinicId: actor.clinicId, name, email, hash: passwordHash, role },
    );
    await recordAudit(tx, actor.clinicId, actor.id, "staff.created", `${email} (${role})`);
    return row!.id;
  });
}

export async function setStaffActive(db: Database, actor: SessionUser, userId: number, active: boolean): Promise<void> {
  requireAdmin(actor);
  if (userId === actor.id && !active) throw new ValidationError("You cannot deactivate your own account");
  const target = await db.one<{ id: number; email: string }>(
    "SELECT id, email FROM users WHERE id = @userId AND clinic_id = @clinicId",
    { userId, clinicId: actor.clinicId },
  );
  if (!target) throw new ValidationError("User not found");
  await db.tx(async (tx) => {
    await tx.query("UPDATE users SET active = @active WHERE id = @userId", { active, userId });
    if (!active) await deleteUserSessions(tx, userId);
    await recordAudit(tx, actor.clinicId, actor.id, active ? "staff.activated" : "staff.deactivated", target.email);
  });
}

export async function changePassword(db: Database, userId: number, current: unknown, next: unknown): Promise<void> {
  const user = await db.one<{ passwordHash: string; clinicId: number }>(
    `SELECT password_hash AS "passwordHash", clinic_id AS "clinicId" FROM users WHERE id = @userId`,
    { userId },
  );
  if (!user || typeof current !== "string" || !verifyPassword(current, user.passwordHash)) {
    throw new ValidationError("Current password is incorrect");
  }
  const passwordHash = hashPassword(requirePassword(next));
  await db.tx(async (tx) => {
    await tx.query("UPDATE users SET password_hash = @hash WHERE id = @userId", { hash: passwordHash, userId });
    // Sign out every session for this user; the caller issues a fresh one.
    await deleteUserSessions(tx, userId);
    await recordAudit(tx, user.clinicId, userId, "account.password_changed");
  });
}
