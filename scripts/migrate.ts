// Applies the Supabase schema (supabase/migrations/*.sql) to the database in DATABASE_URL.
// Safe to run again: applied migrations are recorded and skipped.
//   npm run db:migrate
import { getDb, migrate } from "../src/lib/db";
import { loadLocalEnv } from "../src/lib/env";

async function main() {
  loadLocalEnv();
  const db = getDb();
  const ran = await migrate(db);
  console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Database is already up to date.");
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
