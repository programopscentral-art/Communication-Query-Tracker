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

// Only this tab is ever imported — every other subsheet (pivots, snapshots,
// queries) is ignored.
const DATA_TAB = "communication";

const H: Record<string, string[]> = {
  team: ["Team"], entry_date: ["Entry Date"], update_type: ["Update Type"], category: ["Category"],
  priority: ["Priority"], university: ["University", "Univeristy", "Target Uni", "College"], channel: ["Channel"],
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

/** If the University header was renamed/overwritten in the sheet, find the
 *  column by its content: the one whose values are mostly known universities. */
function detectUniversityCol(grid: string[][], hi: number, isUni: (v: string) => boolean): number {
  const sample = grid.slice(hi + 1, hi + 501);
  const width = Math.max(0, ...sample.map((r) => r.length));
  let best = -1, bestHits = 0;
  for (let c = 0; c < width; c++) {
    let filled = 0, hits = 0;
    for (const row of sample) {
      const v = norm(row[c]);
      if (!v) continue;
      filled++;
      if (isUni(v)) hits++;
    }
    if (filled && hits / filled > 0.6 && hits > bestHits) { best = c; bestHits = hits; }
  }
  return best;
}

export type SyncResult = { inserted: number; updated: number; created: number; preserved: number; scanned: number; skipped: number };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runSheetSync(supabase: SupabaseClient<any>): Promise<SyncResult> {
  // Download the workbook and (best-effort) the tab→gid map in parallel. Google's
  // export is occasionally very slow, so bound it: a timeout fails this run
  // cleanly and the next scheduled run retries.
  const [res, view] = await Promise.all([
    fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`, {
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    }).catch((e: unknown) => {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error("Google Sheets took too long to export the sheet — will retry on the next sync.");
      }
      throw e;
    }),
    fetch(`https://docs.google.com/spreadsheets/d/${SHEET_ID}/htmlview`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.text())
      .catch(() => ""),
  ]);
  const ctype = res.headers.get("content-type") || "";
  if (!res.ok || ctype.includes("text/html")) {
    throw new Error("Can't read the sheet. Share it as 'Anyone with the link: Viewer'.");
  }
  const buf = Buffer.from(await res.arrayBuffer());
  // Parse only the Communication tab, in dense mode (~40% less CPU; identical
  // cell values). Fall back to the full workbook if the tab name's casing differs.
  let wb = XLSX.read(buf, { type: "buffer", sheets: "Communication", dense: true });
  if (!wb.SheetNames.some((n) => lower(n) === DATA_TAB && wb.Sheets[n])) {
    wb = XLSX.read(buf, { type: "buffer", dense: true });
  }

  // gid map (best-effort) for "View in Sheet" deep links
  const gidByTab: Record<string, string> = {};
  const re = /items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g;
  let g: RegExpExecArray | null;
  while ((g = re.exec(view))) {
    try { gidByTab[JSON.parse(`"${g[1]}"`)] = g[2]; } catch { /* skip odd tab name */ }
  }

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

  // parse ONLY the Communication tab
  type Rec = Record<string, unknown> & { source_key: string };
  const parsed: Rec[] = [];
  const sheetName = wb.SheetNames.find((n) => lower(n) === DATA_TAB);
  if (!sheetName) throw new Error('The sheet has no "Communication" tab.');
  {
    const grid = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    const hi = grid.findIndex((r) => r.some((c) => lower(c) === "entry date"));
    if (hi < 0) throw new Error('Couldn\'t find the header row ("Entry Date") in the Communication tab.');
    const header = grid[hi].map(norm);
    const idx: Record<string, number> = {};
    for (const [k, names] of Object.entries(H)) idx[k] = colIndex(header, names);
    if (idx.university < 0) {
      idx.university = detectUniversityCol(grid, hi, (v) => uniMap.has(lower(v)) || /yen[ae]poya/.test(lower(v)));
    }
    if (idx.university < 0 || idx.publish_at < 0) {
      throw new Error("The Communication tab is missing its University or Publish At column.");
    }

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
      };
      parsed.push(rec);
    }
  }
  const rows = parsed;

  // dedupe within batch by source_key
  const seen = new Set<string>();
  const unique = rows.filter((r) => (seen.has(r.source_key) ? false : seen.add(r.source_key)));

  // Existing rows — one round trip. Sheet rows also carry the last outcome the
  // SHEET showed (ss/sa/si), so a sheet edit can be told apart from an app edit.
  const { data: existing, error: stateErr } = await supabase.rpc("existing_task_sync_state");
  if (stateErr) throw new Error(`Couldn't read existing tasks: ${stateErr.message}`);
  const stateMap: Record<string, SyncRowState> = existing ?? {};

  // classify: insert (new / was-UI), update (sheet changed an outcome)
  const toInsert: Rec[] = [];
  const toUpdate: { key: string; patch: Partial<Record<OutcomeCol, unknown>> }[] = [];
  const toRemember: { key: string; o: Outcome }[] = [];
  const uiDupKeys: string[] = [];
  let preserved = 0;
  for (const r of unique) {
    const key = r.source_key;
    const sheetNow: Outcome = {
      s: r.execution_status as string,
      a: (r.actual_publish_date as string | null) ?? null,
      i: (r.issue_blocker as string | null) ?? null,
    };
    const st = stateMap[key];
    if (!st) { toInsert.push(r); toRemember.push({ key, o: sheetNow }); continue; }
    if (st.o === "ui") { uiDupKeys.push(key); toInsert.push(r); toRemember.push({ key, o: sheetNow }); continue; }

    const current: Outcome = { s: st.s, a: st.a, i: st.i };
    const lastSeen: Outcome | null = st.seen ? { s: st.ss ?? "", a: st.sa ?? null, i: st.si ?? null } : null;
    const { patch, kept } = outcomePatch(sheetNow, current, lastSeen);
    if (patch) toUpdate.push({ key, patch });
    if (kept) preserved++;
    if (!lastSeen || !sameOutcome(sheetNow, lastSeen)) toRemember.push({ key, o: sheetNow });
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

  // apply outcome updates — only the fields the sheet changed
  let updated = 0;
  for (const u of toUpdate) {
    const { error } = await supabase.from("tasks").update(u.patch).eq("source_key", u.key);
    if (error) throw new Error(error.message);
    updated++;
  }

  // remember what the sheet showed this run (after the tasks exist — FK)
  for (let i = 0; i < toRemember.length; i += 500) {
    const seenAt = new Date().toISOString();
    const chunk = toRemember.slice(i, i + 500).map((x) => ({
      source_key: x.key, status: x.o.s, actual: x.o.a, issue: x.o.i, seen_at: seenAt,
    }));
    const { error } = await supabase.from("task_sheet_state").upsert(chunk, { onConflict: "source_key" });
    if (error) throw new Error(error.message);
  }

  return { inserted, updated, created, preserved, scanned: unique.length, skipped: unique.length - toInsert.length - updated };
}

// ── Three-way outcome merge ──────────────────────────────────────────────────
type OutcomeCol = "execution_status" | "actual_publish_date" | "issue_blocker";
export type Outcome = { s: string; a: string | null; i: string | null };
type SyncRowState = {
  o: string; s: string; a: string | null; i: string | null;
  seen?: boolean; ss?: string | null; sa?: string | null; si?: string | null;
};

const sameTime = (a: string | null, b: string | null) =>
  (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);
const FIELDS: { k: keyof Outcome; col: OutcomeCol; eq: (x: string | null, y: string | null) => boolean }[] = [
  { k: "s", col: "execution_status", eq: (x, y) => (x ?? "") === (y ?? "") },
  { k: "a", col: "actual_publish_date", eq: sameTime },
  { k: "i", col: "issue_blocker", eq: (x, y) => (x ?? "") === (y ?? "") },
];
const sameOutcome = (x: Outcome, y: Outcome) => FIELDS.every((f) => f.eq(x[f.k], y[f.k]));

/**
 * Decide which outcome fields the sheet should overwrite on an existing row.
 *  • Never seen before (no memory) → the sheet wins on every differing field.
 *  • Otherwise, per field: only if the SHEET changed since last run. If the
 *    sheet is unchanged, the app's value (e.g. a BOA's update) is kept.
 * `kept` = the app differs from an unchanged sheet (an in-app edit preserved).
 */
export function outcomePatch(sheetNow: Outcome, current: Outcome, lastSeen: Outcome | null) {
  const patch: Partial<Record<OutcomeCol, unknown>> = {};
  let kept = false;
  for (const f of FIELDS) {
    if (f.eq(sheetNow[f.k], current[f.k])) continue; // already equal
    const sheetChanged = !lastSeen || !f.eq(sheetNow[f.k], lastSeen[f.k]);
    if (sheetChanged) patch[f.col] = sheetNow[f.k];
    else kept = true;
  }
  return { patch: Object.keys(patch).length ? patch : null, kept };
}

/** One-line human summary of a sync run (Source tab + Sync now toast). */
export function describeSync(r: SyncResult): string {
  const parts: string[] = [];
  if (r.inserted) parts.push(`${r.inserted} new`);
  if (r.updated) parts.push(`${r.updated} status update${r.updated === 1 ? "" : "s"}`);
  if (r.created) parts.push(`${r.created} new universit${r.created === 1 ? "y" : "ies"}`);
  const tail = r.preserved ? ` · ${r.preserved} in-app update${r.preserved === 1 ? "" : "s"} kept` : "";
  return parts.length
    ? `Synced ✓ — ${parts.join(", ")} (${r.scanned} rows scanned)${tail}.`
    : `Up to date ✓ — nothing changed (${r.scanned} rows scanned)${tail}.`;
}

/** Persist the outcome of a sync run so the Source tab can show it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordSyncStatus(supabase: SupabaseClient<any>, source: "auto" | "manual", ok: boolean, message: string) {
  await supabase
    .from("app_settings")
    .update({
      last_sheet_sync_at: new Date().toISOString(),
      last_sheet_sync_ok: ok,
      last_sheet_sync_message: message.slice(0, 500),
      last_sheet_sync_source: source,
    })
    .eq("id", 1);
}
