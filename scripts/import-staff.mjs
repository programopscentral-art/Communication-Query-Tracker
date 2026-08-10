// Imports the University BOAs master sheet into boas + university_boas.
// Keyed by Employee ID (stable) → re-runnable with no duplicates.
//   node scripts/import-staff.mjs           # dry run
//   node scripts/import-staff.mjs --commit   # write
import * as XLSX from "xlsx";
import { connect, loadEnv } from "./db.mjs";

const COMMIT = process.argv.includes("--commit");
const env = loadEnv();
const SHEET_ID = env.GOOGLE_STAFF_SHEET_ID || "1ip-V2pQmqUhsmcctpLUhuQW6I4f_iWkBVz9v0pXu2MY";

const norm = (s) => (s ?? "").toString().trim();
const lower = (s) => norm(s).toLowerCase();

// Bare 10-digit / 0-prefixed / 91-prefixed → +91 E.164.
function toE164(raw) {
  let s = norm(raw);
  if (!s) return null;
  if (s.startsWith("+")) {
    const d = "+" + s.slice(1).replace(/\D/g, "");
    return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
  }
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+91" + d;
  if (d.length === 11 && d.startsWith("0")) return "+91" + d.slice(1);
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  if (d.length >= 8 && d.length <= 15) return "+" + d;
  return null;
}

const H = {
  employee_id: ["Employee ID", "Employee Id", "EmployeeID"],
  name: ["Full Name", "Name"],
  designation: ["Designation"],
  whatsapp: ["WhatsApp Number", "Whatsapp Number", "WhatsApp", "Mobile"],
  email: ["Login Email", "Email"],
  university: ["University", "College"],
  role: ["Role"],
  team_scope: ["Team Scope"],
  reminders: ["Receive Reminders", "Reminders"],
  status: ["Status"],
};
const colIndex = (header, names) => {
  for (const n of names) {
    const i = header.findIndex((h) => lower(h) === lower(n));
    if (i >= 0) return i;
  }
  return -1;
};

async function gidForDataTab() {
  try {
    const html = await (await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`)).text();
    const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g;
    const map = {};
    let m;
    while ((m = re.exec(html))) map[JSON.parse(`"${m[1]}"`)] = m[2];
    return map;
  } catch {
    return {};
  }
}

async function main() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || (res.headers.get("content-type") || "").includes("text/html")) {
    console.error("❌ Staff sheet not exportable — set Share → Anyone with link: Viewer.");
    process.exit(2);
  }
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  const gidByTab = await gidForDataTab();

  const client = await connect();
  const { rows: unis } = await client.query("select id, name, code, aliases from universities");
  const uniMap = new Map();
  for (const u of unis) for (const k of [u.name, u.code, ...(u.aliases || [])]) uniMap.set(lower(k), u.id);
  async function resolveUni(name) {
    const key = lower(name);
    if (uniMap.has(key)) return uniMap.get(key);
    // Merge every Yenepoya/Yenapoya spelling into the single existing university.
    if (/yen[ae]poya/.test(key) && uniMap.has("yenepoya")) {
      const yid = uniMap.get("yenepoya");
      uniMap.set(key, yid);
      return yid;
    }
    const code = key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uni";
    const { rows } = await client.query(
      "insert into universities(name, code, aliases) values ($1,$2,$3) on conflict (code) do update set name=excluded.name returning id",
      [norm(name), code, [norm(name)]],
    );
    uniMap.set(key, rows[0].id);
    console.log(`  + created university "${norm(name)}" (${code})`);
    return rows[0].id;
  }

  let created = 0, updated = 0, assigned = 0;
  const skipped = [];

  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    const hi = grid.findIndex((r) => r.some((c) => lower(c) === "employee id"));
    if (hi < 0) continue;
    const header = grid[hi].map(norm);
    const idx = {};
    for (const [k, names] of Object.entries(H)) idx[k] = colIndex(header, names);
    const gid = gidByTab[sheetName] ?? "1654961757";

    for (let r = hi + 1; r < grid.length; r++) {
      const row = grid[r];
      const emp = norm(row[idx.employee_id]);
      const name = norm(row[idx.name]);
      const uniRaw = norm(row[idx.university]);
      if (!emp || !name || !uniRaw) continue;

      const phone = toE164(row[idx.whatsapp]);
      if (!phone) { skipped.push(`${emp} ${name}: bad phone "${norm(row[idx.whatsapp])}"`); continue; }

      const email = lower(row[idx.email]) || null;
      const ts = lower(row[idx.team_scope]) === "all" ? "" : norm(row[idx.team_scope]);
      const role = lower(row[idx.role]) === "backup" ? "backup" : "primary";
      const receive = idx.reminders < 0 || ["yes", "true", "y", "1", ""].includes(lower(row[idx.reminders]));
      const active = lower(row[idx.status]) !== "inactive";
      const uni_id = await resolveUni(uniRaw);

      if (!COMMIT) { assigned++; continue; }

      try {
        const { rows } = await client.query(
          `insert into boas (employee_id, name, designation, whatsapp_e164, email, active, source_row, source_gid, last_synced_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8, now())
           on conflict (employee_id) do update set
             name=excluded.name, designation=excluded.designation, whatsapp_e164=excluded.whatsapp_e164,
             email=excluded.email, active=excluded.active, source_row=excluded.source_row,
             source_gid=excluded.source_gid, last_synced_at=now()
           returning id, (xmax=0) as inserted`,
          [emp, name, norm(row[idx.designation]) || null, phone, email, active, r + 1, gid],
        );
        rows[0].inserted ? created++ : updated++;
        await client.query(
          `insert into university_boas (university_id, boa_id, role, team_scope, receive_reminders)
           values ($1,$2,$3,$4,$5)
           on conflict (university_id, boa_id, team_scope) do update set
             role=excluded.role, receive_reminders=excluded.receive_reminders`,
          [uni_id, rows[0].id, role, ts, receive],
        );
        assigned++;
      } catch (e) {
        skipped.push(`${emp} ${name}: ${e.message}`);
      }
    }
  }

  console.log(COMMIT
    ? `\n✓ Staff: ${created} created, ${updated} updated, ${assigned} assignments.`
    : `\n(dry run) would process ${assigned} rows.`);
  if (skipped.length) { console.log(`\n⚠ Skipped ${skipped.length}:`); skipped.forEach((s) => console.log("   - " + s)); }
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
