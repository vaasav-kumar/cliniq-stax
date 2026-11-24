import type { Database } from "./db";

export async function recordAudit(
  db: Database,
  clinicId: number,
  userId: number | null,
  action: string,
  detail?: string,
): Promise<void> {
  await db.query(
    "INSERT INTO audit_log (clinic_id, user_id, action, detail) VALUES (@clinicId, @userId, @action, @detail)",
    { clinicId, userId, action, detail: detail ?? null },
  );
}
