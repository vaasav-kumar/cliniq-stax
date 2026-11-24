import { createHash, randomBytes } from "node:crypto";
import type { Database } from "./db";
import type { Role } from "./domain";

export const SESSION_TTL_HOURS = 12;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  clinicId: number;
  clinicName: string;
};

// Only a hash of the token is stored, so a leaked database cannot be used to hijack sessions.
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function createSession(db: Database, userId: number, clinicId: number, now: Date = new Date()): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_TTL_HOURS * 3600 * 1000);
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, clinic_id, expires_at) VALUES (@hash, @userId, @clinicId, @expires)",
    { hash: sha256(token), userId, clinicId, expires },
  );
  return token;
}

export async function resolveSession(db: Database, token: string, now: Date = new Date()): Promise<SessionUser | null> {
  const row = await db.one<SessionUser>(
    `SELECT u.id, u.name, u.email, u.role, u.clinic_id AS "clinicId", c.name AS "clinicName"
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN clinics c ON c.id = u.clinic_id
     WHERE s.token_hash = @hash AND s.expires_at > @now AND u.active = true AND s.clinic_id = u.clinic_id`,
    { hash: sha256(token), now },
  );
  return row ?? null;
}

export async function deleteSession(db: Database, token: string): Promise<void> {
  await db.query("DELETE FROM sessions WHERE token_hash = @hash", { hash: sha256(token) });
}

export async function deleteUserSessions(db: Database, userId: number): Promise<void> {
  await db.query("DELETE FROM sessions WHERE user_id = @userId", { userId });
}
