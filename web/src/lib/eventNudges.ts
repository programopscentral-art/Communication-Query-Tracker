import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istDateISO } from "@/lib/time";
import { fmtEventDate, REPORT_TOTAL } from "@/lib/events";

// Reminders for pending event reports.
//  • DUE: report_filled < 7 and the event's last day is ≥ `after` days ago.
//  • ESCALATED ("overdue" stage): ≥ `escalate` days ago.
//  • Only events whose last day is within the last `lookback` days (no backlog spam).
//  • One row per (event, stage, staff member) in event_nudges — the unique key
//    makes duplicates impossible. An event first seen already escalated gets
//    only the escalation, not both.
//  • Recipients: the university's active staff who receive reminders, in the
//    Student Engagement team scope (or all teams).
//  Rows are 'queued'; WhatsApp delivery drains them once WhatsApp is live.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

export type NudgeSettings = { enabled: boolean; after: number; escalate: number; lookback: number };
export type NudgeResult = {
  queued: number;
  events: number;
  staff: number;
  alreadyReminded: number;
  noStaff: number;
  dryRun: boolean;
  window: { from: string; to: string };
};

export async function loadNudgeSettings(supabase: DB): Promise<NudgeSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("event_nudge_enabled, event_nudge_after_days, event_escalate_after_days, event_nudge_lookback_days")
    .eq("id", 1)
    .single();
  if (error) throw new Error(error.message);
  return {
    enabled: data.event_nudge_enabled,
    after: data.event_nudge_after_days,
    escalate: data.event_escalate_after_days,
    lookback: data.event_nudge_lookback_days,
  };
}

type Ev = {
  id: string;
  title: string;
  event_last_day: string;
  report_filled: number;
  university_id: string;
  universities: { name: string; code: string } | null;
};
type Staff = { university_id: string; boa_id: string; name: string; whatsapp_e164: string };

export function nudgeMessage(stage: "due" | "overdue", staffName: string, e: Ev, appUrl: string): string {
  const first = staffName.split(/\s+/)[0] || "there";
  const when = fmtEventDate(e.event_last_day);
  const link = `${appUrl.replace(/\/$/, "")}/u/${e.universities?.code}/events/${e.id}`;
  const lead = stage === "overdue" ? "⚠️ Overdue: the event report" : "Reminder: the event report";
  return `Hi ${first}, ${lead} for "${e.title}" (${when}, ${e.universities?.name}) is still pending — ${e.report_filled}/${REPORT_TOTAL} key fields filled. Please complete it on PingBoard: ${link}`;
}

export async function runEventNudges(
  supabase: DB,
  opts: { dryRun?: boolean; lookbackOverride?: number } = {},
): Promise<NudgeResult> {
  const s = await loadNudgeSettings(supabase);
  const lookback = opts.lookbackOverride ?? s.lookback;
  const window = { from: istDateISO(-lookback), to: istDateISO(-s.after) };
  const escalateCutoff = istDateISO(-s.escalate);
  const empty: NudgeResult = { queued: 0, events: 0, staff: 0, alreadyReminded: 0, noStaff: 0, dryRun: !!opts.dryRun, window };
  if (!s.enabled && !opts.dryRun) return empty;

  // Events whose report is due, inside the look-back window (paged — no 1000-row cap).
  const events: Ev[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("events")
      .select("id, title, event_last_day, report_filled, university_id, universities(name, code)")
      .lt("report_filled", REPORT_TOTAL)
      .not("university_id", "is", null)
      .is("sheet_missing_since", null)
      .gte("event_last_day", window.from)
      .lte("event_last_day", window.to)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`Couldn't read events: ${error.message}`);
    events.push(...((data ?? []) as unknown as Ev[]));
    if (!data || data.length < 1000) break;
  }
  if (!events.length) return empty;

  // Recipients per university.
  const uniIds = [...new Set(events.map((e) => e.university_id))];
  const { data: assign, error: ae } = await supabase
    .from("university_boas")
    .select("university_id, team_scope, receive_reminders, boas(id, name, whatsapp_e164, active)")
    .in("university_id", uniIds)
    .eq("receive_reminders", true);
  if (ae) throw new Error(`Couldn't read staff: ${ae.message}`);
  const staffByUni = new Map<string, Staff[]>();
  for (const a of (assign ?? []) as unknown as {
    university_id: string; team_scope: string | null; boas: { id: string; name: string; whatsapp_e164: string; active: boolean } | null;
  }[]) {
    const scope = (a.team_scope ?? "").trim().toLowerCase();
    if (!a.boas?.active || !(scope === "" || scope === "all" || scope.includes("student"))) continue;
    const list = staffByUni.get(a.university_id) ?? [];
    if (!list.some((x) => x.boa_id === a.boas!.id)) {
      list.push({ university_id: a.university_id, boa_id: a.boas.id, name: a.boas.name, whatsapp_e164: a.boas.whatsapp_e164 });
    }
    staffByUni.set(a.university_id, list);
  }

  // Reminders already recorded for these events.
  const done = new Set<string>();
  for (let i = 0; i < events.length; i += 300) {
    const { data, error } = await supabase
      .from("event_nudges")
      .select("event_id, stage, boa_id")
      .in("event_id", events.slice(i, i + 300).map((e) => e.id));
    if (error) throw new Error(error.message);
    for (const n of data ?? []) done.add(`${n.event_id}|${n.stage}|${n.boa_id}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://communication-query-tracker.vercel.app";
  const rows: Record<string, unknown>[] = [];
  const staffTouched = new Set<string>();
  let alreadyReminded = 0;
  let noStaff = 0;
  for (const e of events) {
    const staff = staffByUni.get(e.university_id) ?? [];
    if (!staff.length) { noStaff++; continue; }
    const stage: "due" | "overdue" = e.event_last_day <= escalateCutoff ? "overdue" : "due";
    for (const p of staff) {
      if (done.has(`${e.id}|${stage}|${p.boa_id}`)) { alreadyReminded++; continue; }
      rows.push({
        event_id: e.id, boa_id: p.boa_id, stage, channel: "whatsapp", status: "queued",
        whatsapp_e164: p.whatsapp_e164, message: nudgeMessage(stage, p.name, e, appUrl),
      });
      staffTouched.add(p.boa_id);
    }
  }

  let queued = rows.length;
  if (!opts.dryRun && rows.length) {
    queued = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const { data, error } = await supabase
        .from("event_nudges")
        .upsert(rows.slice(i, i + 500), { onConflict: "event_id,stage,boa_id", ignoreDuplicates: true })
        .select("id");
      if (error) throw new Error(`Couldn't queue reminders: ${error.message}`);
      queued += data?.length ?? 0;
    }
  }
  return { queued, events: events.length, staff: staffTouched.size, alreadyReminded, noStaff, dryRun: !!opts.dryRun, window };
}

export function describeNudges(r: NudgeResult, enabled = true): string {
  if (!enabled && !r.dryRun) return "Reminders are switched off.";
  const verb = r.dryRun ? "Would queue" : "Queued";
  if (!r.events) return `${r.dryRun ? "Preview: " : ""}No event reports are due in the reminder window (${fmtEventDate(r.window.from)} – ${fmtEventDate(r.window.to)}).`;
  const bits = [`${verb} ${r.queued} reminder${r.queued === 1 ? "" : "s"} to ${r.staff} staff for ${r.events} due report${r.events === 1 ? "" : "s"}`];
  if (r.alreadyReminded) bits.push(`${r.alreadyReminded} already reminded`);
  if (r.noStaff) bits.push(`${r.noStaff} event${r.noStaff === 1 ? "" : "s"} at universities with no staff to remind`);
  return `${bits.join(" · ")}.`;
}

export async function recordNudgeRun(supabase: DB, source: "auto" | "manual", ok: boolean, message: string) {
  await supabase
    .from("app_settings")
    .update({
      last_event_nudge_at: new Date().toISOString(),
      last_event_nudge_ok: ok,
      last_event_nudge_message: message.slice(0, 500),
      last_event_nudge_source: source,
    })
    .eq("id", 1);
}
