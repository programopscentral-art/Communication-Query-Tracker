import "server-only";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";

// Server-side port of scripts/import-tracker.mjs. Runs under the admin's RLS.
// Only writes the DELTA (new / previously-UI rows), so it's fast and can never
// duplicate. Sheet wins over any matching UI-authored row.

const SHEET_ID = process.env.GOOGLE_SHEET_ID ?? process.env.NEXT_PUBLIC_SHEET_ID!;

const norm = (s: unknown) => (s ?? "").toString().trim();
const lower = (s: unknown) => norm(s).toLowerCase();

const STATUS_MAP = (v: unknown) => {
  const s = lower(v);
  if (!s) return "pending";
  if (s.includes("publish")) return "published";
  if (s.includes("progress")) return "in_progress";
  if (s.includes("block")) return "blocked";
  if (s.includes("restrict")) return "restricted";
  return "pending";
};
const PRIORITY_MAP = (v: unknown) => {
  const s = lower(v);
  if (s.startsWith("crit")) return "Critical";
  if (s.startsWith("high")) return "High";
  return "Normal";
};
function istToUtcISO(v: unknown): string | null {
  const s = norm(v);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0", se = "0"] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se) - 330 * 60000).toISOString();
}
function dateOnly(v: unknown): string | null {
  const m = norm(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const H: Record<string, string[]> = {
  team: ["Team"], entry_date: ["Entry Date"], update_type: ["Update Type"], category: ["Category"],
  priority: ["Priority"], university: ["University", "Univeristy"], channel: ["Channel"],
  content_type: ["Content Type"], target_audience: ["Target Audience"],
  message_content: ["Message / Content", "Message/Content", "Message"],
  poster: ["Poster Drive link", "Poster Drive Link", "Poster"],
  publish_at: ["Publish At (Date & Time)", "Publish At"], special: ["Special Instructions"],
  status: ["Execution Status", "Status"], actual: ["Actual Publish Date"], issue: ["Issue / Blocker", "Issue/Blocker"],
};
const colIndex = (header: string[], names: string[]) => {
  for (const n of names) {
    const i = header.findIndex((h) => lower(h) === lower(n));
    if (i >= 0) return i;
  }
  return -1;
};

export type SyncResult = { inserted: number; updated: number; created: number; scanned: number; skipped: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runSheetSync(supabase: SupabaseClient<any>): Promise<SyncResult> {
  const res = await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`, { redirect: "follow" });
  const ctype = res.headers.get("content-type") || "";
  if (!res.ok || ctype.includes("text/html")) {
    throw new Error("Can't read the sheet. Share it as 'Anyone with the link: Viewer'.");
  }
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });

  // gid map (best-effort) for "View in Sheet" deep links
  const gidByTab: Record<string, string> = {};
  try {
    const view = await (await fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`)).text();
    const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g;
    let g: RegExpExecArray | null;
    while ((g = re.exec(view))) gidByTab[JSON.parse(`"${g[1]}"`)] = g[2];
  } catch { /* deep links fall back */ }

  // university resolver (create if missing)
  const { data: unis } = await supabase.from("universities").select("id, name, code, aliases");
  const uniMap = new Map<string, string>();
  for (const u of unis ?? []) for (const k of [u.name, u.code, ...(u.aliases || [])]) uniMap.set(lower(k), u.id);
  let created = 0;
  async function resolveUni(name: string): Promise<string> {
    const key = lower(name);
    if (uniMap.has(key)) return uniMap.get(key)!;
    if (/yen[ae]poya/.test(key) && uniMap.has("yenepoya")) { const id = uniMap.get("yenepoya")!; uniMap.set(key, id); return id; }
    const code = key.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uni";
    const { data, error } = await supabase.from("universities").upsert({ name, code, aliases: [name] }, { onConflict: "code" }).select("id").single();
    if (error) throw new Error(error.message);
    uniMap.set(key, data.id);
    created++;
    return data.id;
  }

  const SKIP_UNI = new Set(["", "high", "normal", "critical", "grand total", "university"]);

  // parse rows per tab, keep the dominant data tab
  type Rec = Record<string, unknown> & { source_key: string; __tab: string };
  const parsed: Rec[] = [];
  for (const sheetName of wb.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    const hi = grid.findIndex((r) => r.some((c) => lower(c) === "entry date"));
    if (hi < 0) continue;
    const header = grid[hi].map(norm);
    const idx: Record<string, number> = {};
    for (const [k, names] of Object.entries(H)) idx[k] = colIndex(header, names);
    if (idx.university < 0 || idx.publish_at < 0) continue;

    for (let r = hi + 1; r < grid.length; r++) {
      const row = grid[r];
      const uniRaw = norm(row[idx.university]);
      const msg = norm(row[idx.message_content]);
      if (!uniRaw || SKIP_UNI.has(lower(uniRaw))) continue;
      if (!msg && !norm(row[idx.publish_at])) continue;
      const uni_id = await resolveUni(uniRaw);
      const publish_at = istToUtcISO(row[idx.publish_at]);
      const channel = norm(row[idx.channel]) || null;
      const content_type = norm(row[idx.content_type]) || null;
      const rec = {
        team: norm(row[idx.team]) || null,
        entry_date: dateOnly(row[idx.entry_date]),
        update_type: norm(row[idx.update_type]) || null,
        category: norm(row[idx.category]) || null,
        priority: PRIORITY_MAP(row[idx.priority]),
        university_id: uni_id,
        channel,
        content_type,
        target_audience: norm(row[idx.target_audience]) || null,
        message_content: msg || null,
        poster_drive_link: norm(row[idx.poster]) || null,
        publish_at,
        special_instructions: norm(row[idx.special]) || null,
        execution_status: STATUS_MAP(row[idx.status]),
        actual_publish_date: istToUtcISO(row[idx.actual]),
        issue_blocker: norm(row[idx.issue]) || null,
        source_row: r + 1,
        source_gid: gidByTab[sheetName] ?? null,
        origin: "sheet",
        source_key: createHash("sha1").update([uniRaw, publish_at, channel, content_type, (msg || "").slice(0, 120)].join("|")).digest("hex"),
        __tab: sheetName,
      };
      parsed.push(rec);
    }
  }
  const perTab: Record<string, number> = {};
  for (const p of parsed) perTab[p.__tab] = (perTab[p.__tab] || 0) + 1;
  const primary = Object.entries(perTab).sort((a, b) => b[1] - a[1])[0]?.[0];
  const rows = parsed.filter((p) => p.__tab === primary);
  rows.forEach((p) => delete (p as { __tab?: string }).__tab);

  // dedupe within batch by source_key
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.source_key) ? false : seen.add(r.source_key)));

  // existing rows { key: {o:origin, s:status, a:actual, i:issue} } — one round trip
  type State = { o: string; s: string; a: string | null; i: string | null };
  const { data: existing } = await supabase.rpc("existing_task_sync_state");
  const stateMap: Record<string, State> = existing ?? {};
  const sameTime = (a: string | null, b: string | null) => {
    const ta = a ? new Date(a).getTime() : null;
    const tb = b ? new Date(b).getTime() : null;
    return ta === tb;
  };

  // classify: insert (new / was-UI), update (existing sheet row whose outcome changed)
  const toInsert: Rec[] = [];
  const toUpdate: Rec[] = [];
  const uiDupKeys: string[] = [];
  for (const r of unique) {
    const st = stateMap[r.source_key];
    if (!st) { toInsert.push(r); continue; }
    if (st.o === "ui") { uiDupKeys.push(r.source_key); toInsert.push(r); continue; }
    // existing sheet row — Sheet is source of truth: apply outcome changes
    if (
      st.s !== r.execution_status ||
      !sameTime(st.a, r.actual_publish_date as string | null) ||
      (st.i ?? "") !== ((r.issue_blocker as string | null) ?? "")
    ) {
      toUpdate.push(r);
    }
  }

  // Sheet wins: drop UI duplicates first
  for (let i = 0; i < uiDupKeys.length; i += 500) {
    const { error } = await supabase.from("tasks").delete().in("source_key", uiDupKeys.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  // insert the delta (chunked; ignore any concurrent dup)
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += 400) {
    const chunk = toInsert.slice(i, i + 400);
    const { data, error } = await supabase.from("tasks").upsert(chunk, { onConflict: "source_key", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(error.message);
    inserted += data?.length ?? 0;
  }

  // apply outcome updates (only the changed fields → no trigger churn on unchanged rows)
  let updated = 0;
  for (const r of toUpdate) {
    const { error } = await supabase
      .from("tasks")
      .update({
        execution_status: r.execution_status,
        actual_publish_date: r.actual_publish_date,
        issue_blocker: r.issue_blocker,
      })
      .eq("source_key", r.source_key);
    if (error) throw new Error(error.message);
    updated++;
  }

  return { inserted, updated, created, scanned: unique.length, skipped: unique.length - toInsert.length - updated };
}
