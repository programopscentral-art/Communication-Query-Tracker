// Shared DB connection helper (tries direct, then ap-south-1 session pooler).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnv() {
  const env = {};
  for (const line of readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export async function connect() {
  const env = loadEnv();
  const ref = env.SUPABASE_PROJECT_REF;
  const pw = env.SUPABASE_DB_PASSWORD;
  const candidates = [
    env.SUPABASE_DB_URL,
    `postgresql://postgres.${ref}:${pw}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
    `postgresql://postgres.${ref}:${pw}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
  ].filter(Boolean);

  for (const cs of candidates) {
    try {
      const client = new pg.Client({
        connectionString: cs,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
      });
      await client.connect();
      return client;
    } catch {
      /* try next */
    }
  }
  throw new Error("Could not connect to the database on any candidate host.");
}
