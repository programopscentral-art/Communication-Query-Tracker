// Applies supabase/migrations/*.sql to the database, all in one transaction.
// Tries the direct connection first, then the ap-south-1 session pooler.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- tiny .env loader (no dependency) ---
const env = {};
for (const line of readFileSync(path.join(root, ".env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2];
}

const ref = env.SUPABASE_PROJECT_REF;
const pw = env.SUPABASE_DB_PASSWORD;
const candidates = [
  env.SUPABASE_DB_URL,
  // Session pooler (IPv4) — Mumbai region.
  `postgresql://postgres.${ref}:${pw}@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  `postgresql://postgres.${ref}:${pw}@aws-1-ap-south-1.pooler.supabase.com:5432/postgres`,
].filter(Boolean);

const migDir = path.join(root, "supabase", "migrations");
const files = readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();

async function tryConnect(connectionString) {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  return client;
}

let client;
for (const cs of candidates) {
  const host = cs.split("@")[1]?.split("/")[0];
  try {
    process.stdout.write(`Connecting via ${host} … `);
    client = await tryConnect(cs);
    console.log("connected ✓");
    break;
  } catch (e) {
    console.log(`failed (${e.code || e.message})`);
  }
}
if (!client) {
  console.error("\nCould not connect on any candidate. See fallback note below.");
  process.exit(2);
}

try {
  await client.query("BEGIN");
  for (const f of files) {
    process.stdout.write(`  applying ${f} … `);
    await client.query(readFileSync(path.join(migDir, f), "utf8"));
    console.log("ok");
  }
  await client.query("COMMIT");
  console.log("\nAll migrations applied ✓");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`\nFAILED — rolled back. Error:\n${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
