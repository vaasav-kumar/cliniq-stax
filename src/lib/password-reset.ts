import { createHash, randomBytes } from "node:crypto";
import type { Database } from "./db";
import { ValidationError, normalizeEmail, requirePassword } from "./domain";
import { hashPassword } from "./password";
import { recordAudit } from "./audit";
import { clearFailures } from "./accounts";
import { deleteUserSessions } from "./sessions";

export const RESET_TTL_MINUTES = 30;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

// Creates a one-time reset token for an active account and returns the raw token to email.
// Returns null when there is no such account. Callers must show the same message either way so emails cannot be probed.
export async function createPasswordReset(
  db: Database,
  emailInput: unknown,
  now: Date = new Date(),
): Promise<{ token: string; email: string } | null> {
  let email: string;
  try {
    email = normalizeEmail(emailInput);
  } catch {
    return null;
  }
  const user = await db.one<{ id: number; active: boolean }>(
    "SELECT id, active FROM users WHERE email = @email",
    { email },
  );
  if (!user || !user.active) return null;

  const token = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + RESET_TTL_MINUTES * 60 * 1000);
  await db.tx(async (tx) => {
    // Only the newest link works: drop any older unused links for this user.
    await tx.query("DELETE FROM password_resets WHERE user_id = @userId AND used_at IS NULL", { userId: user.id });
    await tx.query(
      "INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (@hash, @userId, @expires)",
      { hash: sha256(token), userId: user.id, expires },
    );
  });
  return { token, email };
}

// Sets the new password if the token is valid, unused and not expired. Signs the account out everywhere.
export async function resetPasswordWithToken(
  db: Database,
  token: unknown,
  newPassword: unknown,
  now: Date = new Date(),
): Promise<void> {
  const invalid = new ValidationError("This reset link is invalid or has expired. Request a new one.");
  if (typeof token !== "string" || token.length === 0) throw invalid;
  const password = requirePassword(newPassword);
  const passwordHash = hashPassword(password);

  const email = await db.tx(async (tx) => {
    // Single-use and race-safe: only one request can flip used_at from null.
    const claimed = await tx.one<{ userId: number }>(
      `UPDATE password_resets SET used_at = @now
       WHERE token_hash = @hash AND used_at IS NULL AND expires_at > @now
       RETURNING user_id AS "userId"`,
      { hash: sha256(token), now },
    );
    if (!claimed) throw invalid;

    const user = await tx.one<{ clinicId: number; email: string }>(
      `UPDATE users SET password_hash = @passwordHash WHERE id = @userId
       RETURNING clinic_id AS "clinicId", email`,
      { passwordHash, userId: claimed.userId },
    );
    if (!user) throw invalid;

    await tx.query("DELETE FROM password_resets WHERE user_id = @userId", { userId: claimed.userId });
    await deleteUserSessions(tx, claimed.userId);
    await recordAudit(tx, user.clinicId, claimed.userId, "account.password_reset");
    return user.email;
  });
  clearFailures(email);
}
