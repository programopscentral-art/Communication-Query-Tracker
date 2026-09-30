import type { SupabaseClient } from "@supabase/supabase-js";
import { periodLabel } from "@/lib/events";
import { istDateISO } from "@/lib/time";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

export type MonthStat = {
  period: string;
  university_id: string | null;
  total: number;
  complete: number;
  partial: number;
  pending: number;
  missing: number;
};

export type EventListRow = {
  id: string;
  title: string;
  event_date: string | null;
  event_end_date: string | null;
  event_date_text: string | null;
  event_last_day: string | null;
  period: string;
  category: string | null;
  subcategory: string | null;
  conducted_by: string | null;
  cma_assigned: string | null;
  mode: string | null;
  zoho_status: string | null;
  report_filled: number;
  sheet_missing_since: string | null;
  origin: string;
  university_id: string | null;
  university_raw: string | null;
  universities: { name: string; code: string } | null;
};

export type EventFilters = {
  month: string | null;
  universityId?: string | null;
  status?: string;
  q?: string;
  zoho?: string;
  missingOnly?: boolean;
  /** events whose last day is on/before this date count as overdue (if report incomplete) */
  overdueCutoff?: string;
};

export async function loadMonthStats(supabase: DB, universityId?: string): Promise<MonthStat[]> {
  let q = supabase.from("v_event_month_stats").select("*");
  if (universityId) q = q.eq("university_id", universityId);
  const { data } = await q;
  return (data ?? []) as MonthStat[];
}

/** Overdue counts per university/month (grace days from settings, IST). */
export async function loadOverdue(supabase: DB, universityId?: string) {
  let q = supabase.from("v_event_overdue").select("university_id, period, overdue");
  if (universityId) q = q.eq("university_id", universityId);
  const { data } = await q;
  return (data ?? []) as { university_id: string | null; period: string; overdue: number }[];
}

/** The date on/before which an incomplete report is overdue. */
export async function loadOverdueCutoff(supabase: DB): Promise<string> {
  const { data } = await supabase.from("app_settings").select("event_nudge_after_days").eq("id", 1).single();
  return istDateISO(-((data?.event_nudge_after_days as number | undefined) ?? 2));
}

export function isOverdue(e: { report_filled: number; event_last_day: string | null; sheet_missing_since?: string | null }, cutoff: string) {
  return e.report_filled < 7 && !!e.event_last_day && e.event_last_day <= cutoff && !e.sheet_missing_since;
}

export function sumStats(rows: MonthStat[]) {
  return rows.reduce(
    (a, r) => ({
      total: a.total + r.total,
      complete: a.complete + r.complete,
      partial: a.partial + r.partial,
      pending: a.pending + r.pending,
      missing: a.missing + r.missing,
    }),
    { total: 0, complete: 0, partial: 0, pending: 0, missing: 0 },
  );
}

/** Month options (newest first) with counts; `defaultMonth` = newest month with events. */
export function monthOptions(stats: MonthStat[]) {
  const byPeriod = new Map<string, number>();
  for (const r of stats) byPeriod.set(r.period, (byPeriod.get(r.period) ?? 0) + r.total);
  const periods = [...byPeriod.keys()].sort().reverse();
  return {
    defaultMonth: periods[0]?.slice(0, 7) ?? "all",
    options: [
      { value: "all", label: "All months" },
      ...periods.map((p) => ({ value: p.slice(0, 7), label: `${periodLabel(p)} (${byPeriod.get(p)})` })),
    ],
  };
}

export const STATUS_OPTIONS = [
  { value: "", label: "Any report status" },
  { value: "overdue", label: "Report overdue" },
  { value: "pending", label: "Report pending" },
  { value: "partial", label: "Report in progress" },
  { value: "complete", label: "Report complete" },
  { value: "open", label: "Not complete (pending + in progress)" },
];

export const ZOHO_OPTIONS = [
  { value: "", label: "Any Zoho status" },
  { value: "pending", label: "Not loaded to Zoho yet" },
  { value: "loaded", label: "Loaded to Zoho" },
];

const EVENT_COLS =
  "id, title, event_date, event_end_date, event_date_text, event_last_day, period, category, subcategory, conducted_by, cma_assigned, mode, zoho_status, report_filled, sheet_missing_since, origin, university_id, university_raw, universities(name, code)";

/** Apply the shared filters (list page + export use the same rules). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyEventFilters<Q extends { eq: any; gt: any; lt: any; gte: any; lte: any; not: any; or: any; is: any }>(q: Q, f: EventFilters): Q {
  if (f.month && f.month !== "all") q = q.eq("period", `${f.month}-01`);
  if (f.universityId) q = q.eq("university_id", f.universityId);
  if (f.status === "pending") q = q.eq("report_filled", 0);
  if (f.status === "partial") q = q.gt("report_filled", 0).lt("report_filled", 7);
  if (f.status === "complete") q = q.gte("report_filled", 7);
  if (f.status === "open") q = q.lt("report_filled", 7);
  if (f.status === "overdue" && f.overdueCutoff) {
    q = q.lt("report_filled", 7).lte("event_last_day", f.overdueCutoff).is("sheet_missing_since", null);
  }
  if (f.zoho === "loaded") q = q.or("zoho_status.ilike.yes,zoho_status.ilike.done");
  if (f.zoho === "pending") q = q.or("zoho_status.is.null,and(zoho_status.not.ilike.yes,zoho_status.not.ilike.done)");
  if (f.missingOnly) q = q.not("sheet_missing_since", "is", null);
  const term = (f.q ?? "").replace(/[,()%*\\]/g, " ").trim();
  if (term) q = q.or(`title.ilike.%${term}%,subcategory.ilike.%${term}%,category.ilike.%${term}%`);
  return q;
}

export async function listEvents(supabase: DB, f: EventFilters): Promise<EventListRow[]> {
  const q = applyEventFilters(
    supabase
      .from("events")
      .select(EVENT_COLS)
      .order("event_date", { ascending: true, nullsFirst: false })
      .order("title")
      .limit(1000),
    f,
  );
  const { data } = await q;
  return (data ?? []) as unknown as EventListRow[];
}
