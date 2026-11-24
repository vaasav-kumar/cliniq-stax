import { Client, Pool, type PoolClient, types } from "pg";
import fs from "node:fs";
import path from "node:path";

// Postgres returns some types as strings by default. Parse them into what the app expects.
types.setTypeParser(20, (v) => Number(v)); // bigint: COUNT(*)
types.setTypeParser(1700, (v) => Number(v)); // numeric: SUM(...)
types.setTypeParser(1082, (v) => v); // date: keep as "YYYY-MM-DD" text

export type Params = Record<string, unknown>;

// Turns "... WHERE id = @id" into "... WHERE id = $1" with values in order.
export function compileSql(sql: string, params: Params): { text: string; values: unknown[] } {
  const values: unknown[] = [];
  const position = new Map<string, number>();
  const text = sql.replace(/@([A-Za-z_]\w*)/g, (_match, name: string) => {
    if (!(name in params)) throw new Error(`Missing SQL parameter: ${name}`);
    if (!position.has(name)) {
      values.push(params[name]);
      position.set(name, values.length);
    }
    return `$${position.get(name)}`;
  });
  return { text, values };
}

export class Database {
  constructor(
    private readonly runner: Pool | PoolClient,
    private readonly inTransaction = false,
  ) {}

  async query<T = Record<string, unknown>>(sql: string, params: Params = {}): Promise<T[]> {
    const { text, values } = compileSql(sql, params);
    // No parameters: use the simple protocol so multi-statement SQL (migrations) works.
    const res = values.length ? await this.runner.query(text, values) : await this.runner.query(text);
    return res.rows as T[];
  }

  async one<T = Record<string, unknown>>(sql: string, params: Params = {}): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }

  // Runs fn inside BEGIN/COMMIT. If already inside a transaction, joins it.
  async tx<T>(fn: (db: Database) => Promise<T>): Promise<T> {
    if (this.inTransaction) return fn(this);
    const client = await (this.runner as Pool).connect();
    try {
      await client.query("BEGIN");
      const result = await fn(new Database(client, true));
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    if (!this.inTransaction && this.runner instanceof Pool) await this.runner.end();
  }
}

function sslOption() {
  // Supabase requires TLS. Certificate checking is on by default.
  // Only set DATABASE_SSL_NO_VERIFY=true if your network re-signs TLS and Node cannot verify the chain.
  return { rejectUnauthorized: process.env.DATABASE_SSL_NO_VERIFY !== "true" };
}

// Creates a connection pool. `schema` is only used by tests, to keep them isolated from real data.
export function connect(url: string, options: { schema?: string; max?: number } = {}): Database {
  const pool = new Pool({
    connectionString: url,
    ssl: sslOption(),
    max: options.max ?? 5,
    options: options.schema ? `-c search_path=${options.schema}` : undefined,
  });
  return new Database(pool);
}

// One dedicated connection (no pool). Used by tests so each test holds a single connection.
export async function connectOne(url: string): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new Client({ connectionString: url, ssl: sslOption() });
  await client.connect();
  return { db: new Database(client as unknown as PoolClient, true), close: () => client.end() };
}

let instance: Database | null = null;

export function getDb(): Database {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and paste your Supabase Postgres connection string.",
    );
  }
  instance = connect(url);
  return instance;
}

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");

// Applies every SQL file in supabase/migrations that has not run yet, in filename order.
export async function migrate(db: Database, dir: string = MIGRATIONS_DIR): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = new Set((await db.query<{ name: string }>("SELECT name FROM schema_migrations")).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await db.tx(async (tx) => {
      await tx.query(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES (@name)", { name: file });
    });
    ran.push(file);
  }
  return ran;
}
