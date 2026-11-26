// Sets a new password for an existing account and signs that account out everywhere.
// Run from your own machine, against the database in .env.local. Use it only for an account you are entitled to reset.
// Usage (the password is read from an environment variable so it is not shown in the process list):
//   NEW_PASSWORD='your-new-password' npm run reset:password -- user@example.com
import { getDb } from "../src/lib/db";
import { normalizeEmail, requirePassword } from "../src/lib/domain";
import { hashPassword } from "../src/lib/password";
import { recordAudit } from "../src/lib/audit";
import { deleteUserSessions } from "../src/lib/sessions";
import { loadLocalEnv } from "../src/lib/env";

async function main() {
  loadLocalEnv();
  const email = normalizeEmail(process.argv[2]);
  const password = requirePassword(process.env.NEW_PASSWORD);

  const db = getDb();
  try {
    const user = await db.one<{ id: number; clinicId: number }>(
      `SELECT id, clinic_id AS "clinicId" FROM users WHERE email = @email`,
      { email },
    );
    if (!user) {
      console.error(`No account found for ${email}.`);
      process.exitCode = 1;
      return;
    }

    const passwordHash = hashPassword(password);
    await db.tx(async (tx) => {
      await tx.query("UPDATE users SET password_hash = @hash, active = true WHERE id = @userId", {
        hash: passwordHash,
        userId: user.id,
      });
      await deleteUserSessions(tx, user.id);
      await recordAudit(tx, user.clinicId, user.id, "account.password_reset_by_operator");
    });
    console.log(`Password reset for ${email}. Sign in with the new password, then change it under My account if you like.`);
  } finally {
    await db.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
