import "server-only";
import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import { REPORT_FIELDS } from "@/lib/events";

// Event Reports: Google Sheet → app sync. READ-ONLY on the sheet (xlsx export).
//
// • Reads every monthly tab; columns are matched by header NAME (they drift
//   between tabs), the month comes from the tab name.
// • Identity, in order: the sheet's "Unique Key" (only if unique across the
//   sheet) → a fingerprint of the row → a soft match to an app-created event.
// • Per-field three-way merge (events.sheet_seen): a sheet value is applied only
//   if the SHEET changed that field since the last run, so app edits survive.
// • Rows removed from the sheet are flagged (sheet_missing_since), not deleted.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;
type Vals = Record<string, string | null>;

/** Sheet-sourced text fields that take part in the merge. */
const MERGE_KEYS = [
  "period", "event_date_text", "university_raw", "conducted_by", "cma_assigned", "category", "subcategory",
  "title", "coverage", "duration", "mode", "zoho_status", "admin_comments",
  ...REPORT_FIELDS.map((f) => f.key),
];

const clean = (v: unknown): string | null => {
  const s = (v ?? "").toString().replace(/\r\n?/g, "\n").trim();
  return s ? s : null;
};
const key = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "");

// ── Header → field ───────────────────────────────────────────────────────────
function fieldForHeader(raw: string): string | null {
  const x = raw.toLowerCase().replace(/\s+/g, " ").trim();
  if (!x) return null;
  const s = (p: string) => x.startsWith(p);
  if (x === "unique key" || s("unique key")) return "sheet_key";
  if (s("event date")) return "event_date_text";
  if (s("campus") || s("university") || s("college")) return "university_raw";
  if (s("conducted by")) return "conducted_by";
  if (s("cma")) return "cma_assigned";
  if (s("event subcategory") || s("event sub category") || s("event sub-category")) return "subcategory";
  if (s("event category")) return "category";
  if (s("event title")) return "title";
  if (s("event coverage")) return "coverage";
  if (s("event duration")) return "duration";
  if (s("event mode")) return "mode";
  if (s("event description")) return "description";
  if (/^(no\.?|number) of registration/.test(x)) return "registrations";
  if (/^(no\.?|number) of participant/.test(x)) return "participants";
  if (s("feedback response rate")) return "feedback_rate";
  if (s("average feedback rating") || s("avg feedback rating")) return "avg_rating";
  if (s("feedback form")) return "feedback_form_link";
  if (s("event feedback")) return "feedback";
  if (s("what went well")) return "highlights";
  if (s("suggested improvement")) return "improvements";
  if (s("event photos") || s("photos")) return "photos_link";
  if (s("registration form")) return "registration_form_link";
  if (s("event recording")) return "recording_link";
  if (s("loaded to zoho")) return "zoho_status";
  if (s("comment")) return "admin_comments";
  return null;
}

/** A column whose header cell is blank but whose neighbours are known (e.g. the
 *  Dec tab lost its "No of Registrations" header): infer it from its position. */
const BLANK_HEADER_RULES: { prev: string; next: string; field: string }[] = [
  { prev: "description", next: "participants", field: "registrations" },
  { prev: "registrations", next: "feedback_rate", field: "participants" },
  { prev: "participants", next: "avg_rating", field: "feedback_rate" },
];

// ── Month / year from the tab name ───────────────────────────────────────────
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
function tabMonth(name: string): { m: number | null; y: number | null } {
  const x = name.toLowerCase();
  let m: number | null = null;
  for (let i = 0; i < 12; i++) if (new RegExp(`(^|[^a-z])${MONTHS[i]}`).test(x)) { m = i + 1; break; }
  const y = x.match(/(20\d{2})/);
  return { m, y: y ? Number(y[1]) : null };
}

// ── Dates ────────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** One date token → ISO. Ambiguous DD/MM vs MM/DD is resolved with the tab month. */
function parseOne(tok: string, tabM: number | null): string | null {
  const t = tok.trim();
  let mm = t.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/);
  if (mm) {
    const [y, m, d] = [Number(mm[1]), Number(mm[2]), Number(mm[3])];
    return m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m) ? iso(y, m, d) : null;
  }
  mm = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (!mm) return null;
  const a = Number(mm[1]), b = Number(mm[2]);
  let y = Number(mm[3]);
  if (y < 100) y += 2000;
  const dm = b >= 1 && b <= 12 && a >= 1 && a <= daysIn(y, b) ? { m: b, d: a } : null; // DD/MM
  const md = a >= 1 && a <= 12 && b >= 1 && b <= daysIn(y, a) ? { m: a, d: b } : null; // MM/DD
  // Prefer DD/MM (India); switch to MM/DD only when that's the reading matching the tab's month.
  let pick = dm ?? md;
  if (tabM && dm && md && dm.m !== tabM && md.m === tabM) pick = md;
  return pick ? iso(y, pick.m, pick.d) : null;
}

/** A date, a range ("03/11/2025 - 9/11/2025", "2/9/2026 & 2/10/2026"), or a list of
 *  days in the tab's month ("4th,5th & 6th", "12th 13th 14th"). */
function parseDateText(text: string | null, tabM: number | null, tabY?: number | null): { start: string | null; end: string | null } {
  if (!text) return { start: null, end: null };
  const parts = text.split(/\s+(?:-|–|to|and)\s+|\s*[&,]\s*/i).map((p) => p.trim()).filter(Boolean);
  let start = parts.length ? parseOne(parts[0], tabM) : null;
  let end = parts.length > 1 ? parseOne(parts[parts.length - 1], tabM) : null;
  if (!start && tabM && tabY && !/[/.]/.test(text) && !/\d{3,}/.test(text)) {
    const days = [...text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\b/gi)]
      .map((m) => Number(m[1]))
      .filter((d) => d >= 1 && d <= daysIn(tabY, tabM));
    if (days.length) {
      start = iso(tabY, tabM, days[0]);
      end = days.length > 1 ? iso(tabY, tabM, days[days.length - 1]) : null;
    }
  }
  // keep an end date only if it's a sane range (1–31 days after the start)
  if (start && end) {
    const span = (Date.parse(end) - Date.parse(start)) / 86400000;
    if (span <= 0 || span > 31) end = null;
  } else end = null;
  return { start, end };
}

/** Excel serial date (a real date cell) → ISO, exact. */
function serialToIso(v: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// ── Parse the workbook ───────────────────────────────────────────────────────
type Cell = { t?: string; v?: unknown; w?: string; z?: string } | undefined;
export type SheetEvent = {
  tab: string;
  gid: string | null;
  row: number; // 1-based sheet row
  sheetKeyRaw: string | null;
  vals: Vals; // MERGE_KEYS values as the sheet shows them
  eventDate: string | null;
  eventEndDate: string | null;
  fpBase: string;
  fp: string;
};

export function parseEventWorkbook(wb: XLSX.WorkBook, gidByTab: Record<string, string>) {
  const out: SheetEvent[] = [];
  const tabsRead: string[] = [];
  for (const tab of wb.SheetNames) {
    const ws = wb.Sheets[tab];
    if (!ws?.["!ref"]) continue;
    const rg = XLSX.utils.decode_range(ws["!ref"]);
    const cellAt = (r: number, c: number) => ws[XLSX.utils.encode_cell({ r, c })] as Cell;
    const text = (c: Cell) => clean(c?.w ?? (c?.v != null ? String(c.v) : ""));

    // header row: the first row (of the first 5) that has both a title and a campus column
    let hi = -1;
    let cols: Record<string, number> = {};
    for (let r = rg.s.r; r <= Math.min(rg.s.r + 4, rg.e.r); r++) {
      const map: Record<string, number> = {};
      for (let c = rg.s.c; c <= rg.e.c; c++) {
        const f = fieldForHeader(text(cellAt(r, c)) ?? "");
        if (f && map[f] === undefined) map[f] = c;
      }
      if (map.title !== undefined && map.university_raw !== undefined) {
        // blank header cells between two known columns → infer the field
        const fieldAt = new Map(Object.entries(map).map(([f, c]) => [c, f]));
        for (let c = rg.s.c + 1; c < rg.e.c; c++) {
          if (text(cellAt(r, c))) continue;
          const rule = BLANK_HEADER_RULES.find(
            (x) => fieldAt.get(c - 1) === x.prev && fieldAt.get(c + 1) === x.next && map[x.field] === undefined,
          );
          if (rule) { map[rule.field] = c; fieldAt.set(c, rule.field); }
        }
        hi = r;
        cols = map;
        break;
      }
    }
    if (hi < 0) continue;
    tabsRead.push(tab);

    const { m: tabM, y: tabY } = tabMonth(tab);
    const rows: { r: number; vals: Vals; key: string | null; dateCellIso: string | null }[] = [];
    for (let r = hi + 1; r <= rg.e.r; r++) {
      const get = (f: string) => (cols[f] === undefined ? null : text(cellAt(r, cols[f])));
      const vals: Vals = {};
      for (const f of MERGE_KEYS) if (f !== "period") vals[f] = get(f);
      if (!vals.title && !vals.university_raw && !vals.event_date_text) continue; // blank row
      if ((vals.title ?? "").toLowerCase() === "event title") continue; // repeated header
      const dc = cols.event_date_text === undefined ? undefined : cellAt(r, cols.event_date_text);
      const dateCellIso =
        dc && dc.t === "n" && typeof dc.v === "number" && dc.z && XLSX.SSF.is_date(dc.z) ? serialToIso(dc.v) : null;
      rows.push({ r, vals, key: get("sheet_key"), dateCellIso });
    }

    // Year for tabs without one (e.g. "Oct"): the most common year among its dates.
    let year = tabY;
    if (!year) {
      const count = new Map<number, number>();
      for (const x of rows) {
        const d = x.dateCellIso ?? parseDateText(x.vals.event_date_text, tabM).start;
        if (d) count.set(Number(d.slice(0, 4)), (count.get(Number(d.slice(0, 4))) ?? 0) + 1);
      }
      year = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? new Date().getUTCFullYear();
    }

    for (const x of rows) {
      const parsed = x.dateCellIso ? { start: x.dateCellIso, end: null } : parseDateText(x.vals.event_date_text, tabM, year);
      const period = tabM ? iso(year, tabM, 1) : parsed.start ? `${parsed.start.slice(0, 7)}-01` : iso(year, 1, 1);
      const vals: Vals = {
        ...x.vals,
        period,
        title: x.vals.title ?? x.vals.subcategory ?? x.vals.category ?? "Untitled event",
      };
      const fpBase = createHash("sha1")
        .update([key(vals.university_raw), key(vals.event_date_text), key(vals.title), key(vals.subcategory), key(vals.conducted_by)].join("|"))
        .digest("hex");
      out.push({
        tab, gid: gidByTab[tab] ?? null, row: x.r + 1, sheetKeyRaw: x.key, vals,
        eventDate: parsed.start, eventEndDate: parsed.end, fpBase, fp: fpBase,
      });
    }
  }

  // Exact duplicate rows get an occurrence suffix so each keeps its own identity.
  const seen = new Map<string, number>();
  for (const e of out) {
    const n = (seen.get(e.fpBase) ?? 0) + 1;
    seen.set(e.fpBase, n);
    e.fp = n > 1 ? `${e.fpBase}#${n}` : e.fpBase;
  }
  // A Unique Key is trusted only if it appears exactly once in the whole sheet.
  const keyCount = new Map<string, number>();
  for (const e of out) if (e.sheetKeyRaw) keyCount.set(e.sheetKeyRaw, (keyCount.get(e.sheetKeyRaw) ?? 0) + 1);
  const validKey = (e: SheetEvent) => (e.sheetKeyRaw && keyCount.get(e.sheetKeyRaw) === 1 ? e.sheetKeyRaw : null);

  return { events: out, tabsRead, validKey };
}

// ── Three-way merge (per field) ──────────────────────────────────────────────
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null);

/** Key-by-key equality (Postgres jsonb reorders keys, so string compare is wrong). */
export function sameVals(a: Vals | null | undefined, b: Vals | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!same(a[k], b[k])) return false;
  return true;
}

/** Which fields the sheet should overwrite. `lastSeen` undefined = never linked. */
export function mergeFields(sheet: Vals, current: Vals, lastSeen: Vals | null) {
  const patch: Vals = {};
  let kept = 0;
  for (const f of MERGE_KEYS) {
    const now = sheet[f] ?? null;
    if (same(now, current[f])) continue;
    if (!lastSeen) {
      // first link: the sheet fills/overrides, but a blank sheet cell never wipes app data
      if (now !== null) patch[f] = now;
      continue;
    }
    if (!same(now, lastSeen[f])) patch[f] = now; // the sheet changed this field
    else kept++; // app edit preserved
  }
  return { patch, kept };
}

// ── Sync ─────────────────────────────────────────────────────────────────────
export type EventSyncResult = {
  inserted: number;
  updated: number;
  kept: number;
  flaggedMissing: number;
  scanned: number;
  tabs: number;
  unmapped: number;
};

type Existing = Vals & {
  id: string;
  origin: string;
  sheet_key: string | null;
  fingerprint: string | null;
  source_tab: string | null;
  source_gid: string | null;
  source_row: number | null;
  sheet_seen: Vals | null;
  sheet_missing_since: string | null;
  university_id: string | null;
  event_date: string | null;
  event_end_date: string | null;
};

async function fetchAllEvents(supabase: DB): Promise<Existing[]> {
  const cols = [
    "id", "origin", "sheet_key", "fingerprint", "source_tab", "source_gid", "source_row", "sheet_seen",
    "sheet_missing_since", "university_id", "event_date", "event_end_date", ...MERGE_KEYS,
  ].join(", ");
  const all: Existing[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("events").select(cols).order("id").range(from, from + 999);
    if (error) throw new Error(`Couldn't read existing events: ${error.message}`);
    all.push(...((data ?? []) as unknown as Existing[]));
    if (!data || data.length < 1000) break;
  }
  return all;
}

export async function runEventSync(supabase: DB): Promise<EventSyncResult> {
  const { data: settings, error: se } = await supabase.from("app_settings").select("events_sheet_id").eq("id", 1).single();
  if (se) throw new Error(se.message);
  const sheetId = settings?.events_sheet_id as string;

  const [res, view] = await Promise.all([
    fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/export?format=xlsx`, {
      redirect: "follow",
      signal: AbortSignal.timeout(45_000),
    }).catch((e: unknown) => {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
        throw new Error("Google Sheets took too long to export the events sheet — will retry on the next sync.");
      }
      throw e;
    }),
    fetch(`https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`, { signal: AbortSignal.timeout(15_000) })
      .then((r) => r.text())
      .catch(() => ""),
  ]);
  if (!res.ok || (res.headers.get("content-type") || "").includes("text/html")) {
    throw new Error("Can't read the events sheet. Share it as 'Anyone with the link: Viewer'.");
  }
  const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
  const gidByTab: Record<string, string> = {};
  for (const g of view.matchAll(/items\.push\(\{name:\s*"((?:[^"\\]|\\.)*)"[^}]*?gid:\s*"(\d+)"/g)) {
    try { gidByTab[JSON.parse(`"${g[1]}"`)] = g[2]; } catch { /* skip odd tab name */ }
  }

  const { events: incoming, tabsRead, validKey } = parseEventWorkbook(wb, gidByTab);
  if (tabsRead.length === 0) throw new Error("No event tabs found in the sheet (need 'Event Title' and 'Campus / University Name' columns).");

  // university resolver: name / code / aliases, punctuation-insensitive. No auto-create.
  const { data: unis, error: ue } = await supabase.from("universities").select("id, name, code, aliases");
  if (ue) throw new Error(ue.message);
  const uniMap = new Map<string, string>();
  for (const u of unis ?? []) for (const n of [u.name, u.code, ...(u.aliases ?? [])]) if (n) uniMap.set(key(n), u.id);
  const resolveUni = (raw: string | null) => {
    if (!raw) return null;
    const k = key(raw);
    return uniMap.get(k) ?? (/yen[ae]poya/.test(k) ? uniMap.get("yenepoya") ?? null : null);
  };

  const existing = await fetchAllEvents(supabase);
  const byKey = new Map<string, Existing>();
  const byFp = new Map<string, Existing>();
  const bySoft = new Map<string, Existing[]>();
  for (const e of existing) {
    if (e.sheet_key) byKey.set(e.sheet_key, e);
    if (e.fingerprint) byFp.set(e.fingerprint, e);
    if (e.origin === "ui" && !e.fingerprint) {
      const k = `${e.university_id}|${e.event_date}|${key(e.title)}`;
      bySoft.set(k, [...(bySoft.get(k) ?? []), e]);
    }
  }

  const matched = new Set<string>();
  const inserts: Record<string, unknown>[] = [];
  const updates: { id: string; patch: Record<string, unknown> }[] = [];
  const keyTakenBy = new Map<string, string>(); // sheet_key → event id that will hold it
  const fpTakenBy = new Map<string, string>(); // fingerprint → event id that will hold it
  let kept = 0;

  for (const inc of incoming) {
    const k = validKey(inc);
    const uniId = resolveUni(inc.vals.university_raw);
    let hit: Existing | undefined;
    if (k && byKey.has(k) && !matched.has(byKey.get(k)!.id)) hit = byKey.get(k);
    if (!hit && byFp.has(inc.fp) && !matched.has(byFp.get(inc.fp)!.id)) hit = byFp.get(inc.fp);
    if (!hit && uniId && inc.eventDate) {
      hit = (bySoft.get(`${uniId}|${inc.eventDate}|${key(inc.vals.title)}`) ?? []).find((e) => !matched.has(e.id));
    }
    const seenVals: Vals = { ...inc.vals, sheet_key_raw: inc.sheetKeyRaw };

    if (!hit) {
      inserts.push({
        origin: "sheet", sheet_key: k, fingerprint: inc.fp, source_tab: inc.tab, source_gid: inc.gid, source_row: inc.row,
        sheet_seen: seenVals, ...inc.vals, event_date: inc.eventDate, event_end_date: inc.eventEndDate, university_id: uniId,
      });
      if (k) keyTakenBy.set(k, "__insert__");
      continue;
    }
    matched.add(hit.id);

    const lastSeen = hit.sheet_seen && Object.keys(hit.sheet_seen).length ? hit.sheet_seen : null;
    const { patch: fieldPatch, kept: k2 } = mergeFields(inc.vals, hit, lastSeen);
    kept += k2;
    const patch: Record<string, unknown> = { ...fieldPatch };
    if ("event_date_text" in fieldPatch) { patch.event_date = inc.eventDate; patch.event_end_date = inc.eventEndDate; }
    if ("university_raw" in fieldPatch) patch.university_id = uniId;
    else if (!hit.university_id && uniId) patch.university_id = uniId; // a campus name mapped since last run
    // provenance (always the sheet's current view)
    const prov: Record<string, unknown> = {
      origin: "sheet", sheet_key: k, fingerprint: inc.fp, source_tab: inc.tab, source_gid: inc.gid,
      source_row: inc.row, sheet_missing_since: null,
    };
    for (const [f, v] of Object.entries(prov)) if ((hit as Record<string, unknown>)[f] !== v) patch[f] = v;
    if (!sameVals(hit.sheet_seen, seenVals)) patch.sheet_seen = seenVals;
    if (k) keyTakenBy.set(k, hit.id);
    fpTakenBy.set(inc.fp, hit.id);
    if (Object.keys(patch).length) updates.push({ id: hit.id, patch });
  }

  // A Unique Key / fingerprint moving between rows: free it from its old holder
  // first, or the unique constraints would reject the swap mid-way. (Each row
  // being updated gets its new value in its own update right after.)
  const freeKey = existing
    .filter((e) => e.sheet_key && keyTakenBy.has(e.sheet_key) && keyTakenBy.get(e.sheet_key) !== e.id)
    .map((e) => e.id);
  const freeFp = existing
    .filter((e) => e.fingerprint && fpTakenBy.has(e.fingerprint) && fpTakenBy.get(e.fingerprint) !== e.id)
    .map((e) => e.id);
  for (const [ids, patch] of [[freeKey, { sheet_key: null }], [freeFp, { fingerprint: null }]] as const) {
    for (let i = 0; i < ids.length; i += 200) {
      const { error } = await supabase.from("events").update(patch).in("id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
  }

  for (const u of updates) {
    const { error } = await supabase.from("events").update(u.patch).eq("id", u.id);
    if (error) throw new Error(`Couldn't update an event: ${error.message}`);
  }

  let inserted = 0;
  for (let i = 0; i < inserts.length; i += 400) {
    const { data, error } = await supabase
      .from("events")
      .upsert(inserts.slice(i, i + 400), { onConflict: "fingerprint", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`Couldn't add events: ${error.message}`);
    inserted += data?.length ?? 0;
  }

  // Flag sheet rows that disappeared — only if this read looks complete.
  const previousSheetRows = existing.filter((e) => e.origin === "sheet").length;
  let flaggedMissing = 0;
  if (incoming.length >= Math.min(previousSheetRows * 0.5, previousSheetRows - 20)) {
    const gone = existing.filter((e) => e.origin === "sheet" && !matched.has(e.id) && !e.sheet_missing_since).map((e) => e.id);
    for (let i = 0; i < gone.length; i += 200) {
      const { error } = await supabase.from("events").update({ sheet_missing_since: new Date().toISOString() }).in("id", gone.slice(i, i + 200));
      if (error) throw new Error(error.message);
    }
    flaggedMissing = gone.length;
  }

  const unmapped = new Set(incoming.filter((e) => e.vals.university_raw && !resolveUni(e.vals.university_raw)).map((e) => key(e.vals.university_raw))).size;
  return { inserted, updated: updates.length, kept, flaggedMissing, scanned: incoming.length, tabs: tabsRead.length, unmapped };
}

export function describeEventSync(r: EventSyncResult): string {
  const parts: string[] = [];
  if (r.inserted) parts.push(`${r.inserted} new`);
  if (r.updated) parts.push(`${r.updated} updated`);
  if (r.flaggedMissing) parts.push(`${r.flaggedMissing} no longer in the sheet`);
  const tail = [
    r.kept ? `${r.kept} in-app edit${r.kept === 1 ? "" : "s"} kept` : "",
    r.unmapped ? `${r.unmapped} campus name${r.unmapped === 1 ? "" : "s"} to map` : "",
  ].filter(Boolean).join(" · ");
  const head = parts.length ? `Synced ✓ — ${parts.join(", ")}` : "Up to date ✓ — nothing changed";
  return `${head} (${r.scanned} events across ${r.tabs} month tabs)${tail ? ` · ${tail}` : ""}.`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recordEventSyncStatus(supabase: DB, source: "auto" | "manual", ok: boolean, message: string) {
  await supabase
    .from("app_settings")
    .update({
      last_event_sync_at: new Date().toISOString(),
      last_event_sync_ok: ok,
      last_event_sync_message: message.slice(0, 500),
      last_event_sync_source: source,
    })
    .eq("id", 1);
}
