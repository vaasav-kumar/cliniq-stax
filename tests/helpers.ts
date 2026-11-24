import { randomBytes } from "node:crypto";
import type { TestContext } from "node:test";
import { connectOne, migrate, MIGRATIONS_DIR, type Database } from "../src/lib/db";
import { loadLocalEnv } from "../src/lib/env";

loadLocalEnv();

// Each test gets its own throwaway Postgres schema on the Supabase database named in DATABASE_URL.
// It uses one connection, which is closed and the schema dropped when the test finishes.
// The Supabase pooler has a small connection limit, so tests must not open pools.
export async function freshDb(t: TestContext): Promise<Database> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Set DATABASE_URL in .env.local (your Supabase Postgres connection string) to run tests.");
  }
  const schema = `test_${randomBytes(6).toString("hex")}`;
  const { db, close } = await connectOne(url);
  t.after(async () => {
    await db.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
    await close();
  });
  await db.query(`CREATE SCHEMA ${schema}`);
  await db.query(`SET search_path TO ${schema}`);
  await migrate(db, MIGRATIONS_DIR);
  return db;
}
