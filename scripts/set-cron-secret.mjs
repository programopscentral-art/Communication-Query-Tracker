// Stores CRON_SECRET (from the root .env) in Supabase Vault as
// 'pingboard_cron_secret', where the pg_cron sheet-sync job reads it.
// Idempotent: updates the secret if it already exists.
//   node scripts/set-cron-secret.mjs
import { connect, loadEnv } from "./db.mjs";

const secret = loadEnv().CRON_SECRET;
if (!secret) {
  console.error("❌ CRON_SECRET is not set in .env");
  process.exit(2);
}

const c = await connect();
const { rows } = await c.query("select id from vault.secrets where name = 'pingboard_cron_secret'");
if (rows.length) {
  await c.query("select vault.update_secret($1, $2)", [rows[0].id, secret]);
  console.log("✓ Updated Vault secret 'pingboard_cron_secret'.");
} else {
  await c.query("select vault.create_secret($1, 'pingboard_cron_secret', 'Bearer token for /api/cron/sync-sheet')", [secret]);
  console.log("✓ Created Vault secret 'pingboard_cron_secret'.");
}
await c.end();
