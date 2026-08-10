// Imports the Communication_Query_Tracker Google Sheet into public.tasks.
// Reads the public XLSX export (link-shared), maps columns, resolves/creates
// universities, and upserts idempotently on source_key.
//
//   node scripts/import-tracker.mjs          # dry run (inspect only)
//   node scripts/import-tracker.mjs --commit # write to DB
import crypto from "node:crypto";
import * as XLSX from "xlsx";
import { connect, loadEnv } from "./db.mjs";

const COMMIT = process.argv.includes("--commit");
const env = loadEnv();
const SHEET_ID = env.GOOGLE_SHEET_ID;
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;

const norm = (s) => (s ?? "").toString().trim();
const lower = (s) => norm(s).toLowerCase();

const STATUS_MAP = (v) => {
  const s = lower(v);
  if (!s) return "pending";
  if (s.includes("publish")) return "published";
  if (s.includes("progress")) return "in_progress";
  if (s.includes("block")) return "blocked";
  if (s.includes("restrict")) return "restricted";
  if (s.includes("pending")) return "pending";
  return "pending";
};
const PRIORITY_MAP = (v) => {
  const s = lower(v);
  if (s.startsWith("crit")) return "critical";
  if (s.startsWith("high")) return "high";
  return "normal";
};

// "DD/MM/YYYY HH:MM:SS" (IST wall-clock) -> UTC ISO. Handles date-only too.
function istToUtcISO(v) {
  const s = norm(v);
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
  const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) - 330 * 60000; // IST = UTC+5:30
  return new Date(ms).toISOString();
}
function dateOnly(v) {
  const s = norm(v);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const H = {
  team: ["Team"],
  entry_date: ["Entry Date"],
  update_type: ["Update Type"],
  category: ["Category"],
  priority: ["Priority"],
  university: ["University", "Univeristy"],
  channel: ["Channel"],
  content_type: ["Content Type"],
  target_audience: ["Target Audience"],
  message_content: ["Message / Content", "Message/Content", "Message"],
  poster: ["Poster Drive link", "Poster Drive Link", "Poster"],
  publish_at: ["Publish At (Date & Time)", "Publish At"],
  special: ["Special Instructions"],
  status: ["Execution Status", "Status"],
  actual: ["Actual Publish Date"],
  issue: ["Issue / Blocker", "Issue/Blocker"],
};
function colIndex(header, names) {
  for (const n of names) {
    const i = header.findIndex((h) => lower(h) === lower(n));
    if (i >= 0) return i;
  }
  return -1;
}

async function main() {
  console.log(`Fetching ${URL} …`);
  const res = await fetch(URL, { redirect: "follow" });
  const buf = Buffer.from(await res.arrayBuffer());
  const ctype = res.headers.get("content-type") || "";
  if (!res.ok || ctype.includes("text/html")) {
    console.error(
      `\n❌ Could not fetch the sheet as XLSX (got ${res.status}, ${ctype}).\n` +
        `The sheet may not be link-shared. Fix: open it → Share → "Anyone with the link: Viewer",\n` +
        `or File → Download → Microsoft Excel (.xlsx) and tell me the path.`,
    );
    process.exit(2);
  }
  const wb = XLSX.read(buf, { type: "buffer" });
  console.log(`Tabs: ${wb.SheetNames.join(", ")}`);

  // tab name -> gid (for deep-linking rows back to the sheet). Best-effort.
  const gidByTab = {};
  try {
    const view = await (await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`)).text();
    const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g;
    let g;
    while ((g = re.exec(view))) gidByTab[JSON.parse(`"${g[1]}"`)] = g[2];
  } catch {
    /* deep links will fall back to the sheet root */
  }

  const client = await connect();

  // Respect the Data Source switch: in UI mode the Sheet import is paused so it
  // can't overwrite app-authored data (unless explicitly forced).
  const { rows: modeRows } = await client.query("select data_source_mode from app_settings where id=1");
  if (modeRows[0]?.data_source_mode === "ui" && !process.argv.includes("--force")) {
    console.log("⏸  Data source = UI mode — skipping Sheet import (pass --force to override).");
    await client.end();
    return;
  }

  // university lookup: alias/name/code -> id (create if missing)
  const { rows: unis } = await client.query("select id, name, code, aliases from universities");
  const uniMap = new Map();
  for (const u of unis) {
    for (const k of [u.name, u.code, ...(u.aliases || [])]) uniMap.set(lower(k), u.id);
  }
  async function resolveUni(name) {
    const key = lower(name);
    if (uniMap.has(key)) return uniMap.get(key);
    // auto-create (dynamic onboarding)
    const code = key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uni";
    const { rows } = await client.query(
      "insert into universities(name, code, aliases) values ($1,$2,$3) on conflict (code) do update set name=excluded.name returning id",
      [norm(name) || "Unknown", code, [norm(name)]],
    );
    uniMap.set(key, rows[0].id);
    console.log(`  + created university "${norm(name)}" (${code})`);
    return rows[0].id;
  }

  const parsed = [];
  let skipped = 0;
  // Known noise values seen in the sheet that must never become universities.
  const SKIP_UNI = new Set(["", "high", "normal", "critical", "grand total", "university"]);

  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    // find header row (contains "Entry Date")
    const hi = grid.findIndex((r) => r.some((c) => lower(c) === "entry date"));
    if (hi < 0) { console.log(`  · skip tab "${sheetName}" (no data header)`); continue; }
    const header = grid[hi].map(norm);
    const idx = {};
    for (const [k, names] of Object.entries(H)) idx[k] = colIndex(header, names);
    if (idx.university < 0 || idx.publish_at < 0) { console.log(`  · skip tab "${sheetName}" (missing cols)`); continue; }

    let tabCount = 0;
    for (let r = hi + 1; r < grid.length; r++) {
      const row = grid[r];
      const uniRaw = norm(row[idx.university]);
      const msg = norm(row[idx.message_content]);
      if (!uniRaw || SKIP_UNI.has(lower(uniRaw))) { skipped++; continue; } // blank/noise
      if (!msg && !norm(row[idx.publish_at])) { skipped++; continue; }
      const uni_id = await resolveUni(uniRaw);
      const publish_at = istToUtcISO(row[idx.publish_at]);
      const rec = {
        team: norm(row[idx.team]) || null,
        entry_date: dateOnly(row[idx.entry_date]),
        update_type: norm(row[idx.update_type]) || null,
        category: norm(row[idx.category]) || null,
        priority: PRIORITY_MAP(row[idx.priority]),
        university_id: uni_id,
        channel: norm(row[idx.channel]) || null,
        content_type: norm(row[idx.content_type]) || null,
        target_audience: norm(row[idx.target_audience]) || null,
        message_content: msg || null,
        poster_drive_link: norm(row[idx.poster]) || null,
        publish_at,
        special_instructions: norm(row[idx.special]) || null,
        execution_status: STATUS_MAP(row[idx.status]),
        actual_publish_date: istToUtcISO(row[idx.actual]),
        issue_blocker: norm(row[idx.issue]) || null,
        source_row: r + 1,                    // 1-based Google Sheet row
        source_gid: gidByTab[sheetName] ?? null,
        origin: "sheet",
      };
      rec.source_key = crypto
        .createHash("sha1")
        .update([uniRaw, rec.publish_at, rec.channel, rec.content_type, (msg || "").slice(0, 120)].join("|"))
        .digest("hex");
      rec.__tab = sheetName;
      parsed.push(rec);
      tabCount++;
    }
    console.log(`  · tab "${sheetName}": ${tabCount} rows`);
  }

  // Keep only the dominant data tab (avoids importing derived/snapshot tabs
  // like a per-university "Detail" copy). Future multi-tab sheets: adjust here.
  const perTab = {};
  for (const p of parsed) perTab[p.__tab] = (perTab[p.__tab] || 0) + 1;
  const primaryTab = Object.entries(perTab).sort((a, b) => b[1] - a[1])[0]?.[0];
  const kept = parsed.filter((p) => p.__tab === primaryTab);
  console.log(`\nPrimary data tab: "${primaryTab}" → ${kept.length} rows (dropped ${parsed.length - kept.length} from other tabs)`);
  parsed.length = 0;
  parsed.push(...kept);

  console.log(`\nParsed ${parsed.length} rows (skipped ${skipped} blanks).`);
  const byStatus = {};
  for (const p of parsed) byStatus[p.execution_status] = (byStatus[p.execution_status] || 0) + 1;
  console.log("By status:", byStatus);
  console.log("Sample:", JSON.stringify(parsed[0], null, 2));

  if (!COMMIT) {
    console.log("\n(dry run — pass --commit to write)");
    await client.end();
    return;
  }

  // de-dupe by source_key within this batch
  const seen = new Set();
  const rows = parsed.filter((p) => (seen.has(p.source_key) ? false : seen.add(p.source_key)));
  // "Sheet wins": drop any UI-authored duplicates of incoming sheet rows first.
  const allKeys = rows.map((r) => r.source_key);
  for (let i = 0; i < allKeys.length; i += 1000) {
    await client.query("delete from tasks where origin='ui' and source_key = any($1)", [allKeys.slice(i, i + 1000)]);
  }

  const cols = [
    "team","entry_date","update_type","category","priority","university_id","channel",
    "content_type","target_audience","message_content","poster_drive_link","publish_at",
    "special_instructions","execution_status","actual_publish_date","issue_blocker","source_key",
    "source_row","source_gid","origin",
  ];
  const CHUNK = 400;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = [];
    const params = [];
    slice.forEach((rec, j) => {
      const base = j * cols.length;
      values.push(`(${cols.map((_, k) => `$${base + k + 1}`).join(",")})`);
      params.push(...cols.map((c) => rec[c]));
    });
    // New rows insert fully; existing rows only get their sheet row-refs
    // backfilled (never overwrite status/content that staff may have edited).
    const sql = `insert into tasks (${cols.join(",")}) values ${values.join(",")}
                 on conflict (source_key) do update
                   set source_row = excluded.source_row,
                       source_gid = excluded.source_gid`;
    const res = await client.query(sql, params);
    inserted += res.rowCount;
    process.stdout.write(`\r  inserted ${inserted}/${rows.length} …`);
  }
  console.log(`\n✓ Imported ${inserted} tasks.`);
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
