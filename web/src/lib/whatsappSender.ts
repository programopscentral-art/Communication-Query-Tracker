import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { waConfig, sendTemplate, WaError, type WaConfig } from "@/lib/whatsapp";
import { reminderParams, eventParams, type ReminderInput } from "@/lib/whatsappMessages";
import { fmtEventDate, REPORT_TOTAL } from "@/lib/events";

// Drains due WhatsApp work. Called every minute by pg_cron (only when something
// is due — see 0031) via /api/cron/send-whatsapp, with the service-role client.
//
// Safety rules, in order:
//  1. Master switch off → do nothing.
//  2. Quiet hours (IST) → reminders falling due are skipped, not delayed.
//  3. A reminder more than `max_late` minutes late is skipped ("too late") —
//     claim_due_reminders does this, so an old backlog can never be blasted.
//  4. Task already published / report already complete / staff inactive → skipped.
//  5. Test mode → only numbers on the test list receive anything.
//  6. Retry temporary errors (max 4 attempts, still within the lateness window);
//     a setup error (bad token, missing template) stops the run and is shown in the app.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

export type WaSettings = {
  enabled: boolean;
  testMode: boolean;
  testNumbers: string[];
  quietStart: string; // "22:00"
  quietEnd: string; // "08:00"
  maxLateMin: number;
};

export type Tally = { sent: number; failed: number; retry: number; skipped: number };
export type SenderResult = {
  ran: boolean;
  note?: string;
  quiet?: boolean;
  quietSkipped?: number;
  reminders: Tally;
  reports: Tally;
  fatal?: string;
};

const MAX_ATTEMPTS = 4;
const BATCH = 100;
const CONCURRENCY = 6;
const TIME_BUDGET_MS = 45_000;

export async function loadWaSettings(supabase: DB): Promise<WaSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("whatsapp_enabled, whatsapp_test_mode, whatsapp_test_numbers, whatsapp_quiet_start, whatsapp_quiet_end, whatsapp_max_late_min")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`Couldn't read WhatsApp settings: ${error.message}`);
  return {
    enabled: !!data.whatsapp_enabled,
    testMode: data.whatsapp_test_mode !== false,
    testNumbers: (data.whatsapp_test_numbers as string[] | null) ?? [],
    quietStart: String(data.whatsapp_quiet_start ?? "22:00").slice(0, 5),
    quietEnd: String(data.whatsapp_quiet_end ?? "08:00").slice(0, 5),
    maxLateMin: data.whatsapp_max_late_min ?? 5,
  };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Is `now` inside the IST quiet window? Handles windows that cross midnight. */
export function inQuietHours(s: Pick<WaSettings, "quietStart" | "quietEnd">, now = new Date()): boolean {
  const ist = new Date(now.getTime() + 330 * 60000);
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const a = toMin(s.quietStart), b = toMin(s.quietEnd);
  if (a === b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

/** Run `fn` over `items` with limited parallelism. */
async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

type JobRow = ReminderInput & { job_id: string; attempts: number; whatsapp_e164: string | null; execution_status: string };

export async function runWhatsAppSender(supabase: DB, cfg: WaConfig = waConfig()): Promise<SenderResult> {
  const s = await loadWaSettings(supabase);
  const reminders: Tally = { sent: 0, failed: 0, retry: 0, skipped: 0 };
  const reports: Tally = { sent: 0, failed: 0, retry: 0, skipped: 0 };
  if (!s.enabled) return { ran: false, note: "WhatsApp sending is switched off.", reminders, reports };

  if (inQuietHours(s)) {
    const { data, error } = await supabase.rpc("skip_due_reminders", {
      p_reason: `Quiet hours — no WhatsApp ${s.quietStart}–${s.quietEnd} IST`,
    });
    if (error) throw new Error(`Couldn't apply quiet hours: ${error.message}`);
    return { ran: true, quiet: true, quietSkipped: (data as number) ?? 0, reminders, reports };
  }

  const started = Date.now();
  const testList = new Set(s.testNumbers);
  const blockedByTest = (n: string) => s.testMode && !testList.has(n);
  let fatal: string | undefined;

  // ── Publish reminders ──────────────────────────────────────────────────────
  const { data: claimed, error: ce } = await supabase.rpc("claim_due_reminders", { p_limit: BATCH, p_max_late_min: s.maxLateMin });
  if (ce) throw new Error(`Couldn't claim reminders: ${ce.message}`);
  const claimedIds = ((claimed ?? []) as { id: string }[]).map((j) => j.id);

  if (claimedIds.length) {
    const { data: details, error: de } = await supabase
      .from("reminder_job_details")
      .select("job_id, attempts, whatsapp_e164, boa_name, university_name, university_code, task_id, team, update_type, category, priority, channel, content_type, publish_at, execution_status")
      .in("job_id", claimedIds);
    if (de) {
      await supabase.from("reminder_jobs").update({ status: "pending", claimed_at: null }).in("id", claimedIds);
      throw new Error(`Couldn't read reminder details: ${de.message}`);
    }
    const jobs = (details ?? []) as JobRow[];
    const update = (id: string, patch: Record<string, unknown>) => supabase.from("reminder_jobs").update(patch).eq("id", id);
    const skip = async (id: string, reason: string) => {
      await update(id, { status: "skipped", skip_reason: reason, claimed_at: null });
      reminders.skipped++;
    };

    await pool(jobs, CONCURRENCY, async (j) => {
      if (fatal || Date.now() - started > TIME_BUDGET_MS) {
        await update(j.job_id, { status: "pending", claimed_at: null, attempts: Math.max(0, j.attempts - 1) });
        return;
      }
      if (j.execution_status === "published") return skip(j.job_id, "Already published");
      if (!j.whatsapp_e164) return skip(j.job_id, "No WhatsApp number on the staff record");
      if (blockedByTest(j.whatsapp_e164)) return skip(j.job_id, "Test mode — number not on the test list");
      const { params, button } = reminderParams(j);
      try {
        const id = await sendTemplate(cfg, j.whatsapp_e164, cfg.templates.reminder, params, button);
        await update(j.job_id, { status: "sent", wa_message_id: id, sent_at: new Date().toISOString(), error: null, delivery_status: "sent", claimed_at: null });
        reminders.sent++;
      } catch (e) {
        const w = e instanceof WaError ? e : new WaError(String(e), null, false, false);
        if (w.fatal) fatal = w.message;
        const giveUp = (w.permanent && !w.fatal) || j.attempts >= MAX_ATTEMPTS;
        await update(j.job_id, { status: giveUp ? "failed" : "pending", error: w.message, claimed_at: null });
        if (giveUp) reminders.failed++;
        else reminders.retry++;
      }
    });
    // Rows claimed but gone from the view (task deleted mid-run) — nothing to send.
    const seen = new Set(jobs.map((j) => j.job_id));
    const orphans = claimedIds.filter((id) => !seen.has(id));
    if (orphans.length) await supabase.from("reminder_jobs").update({ status: "skipped", skip_reason: "Task no longer exists", claimed_at: null }).in("id", orphans);
  }

  // ── Event report reminders ─────────────────────────────────────────────────
  if (!fatal && Date.now() - started < TIME_BUDGET_MS) {
    const { data: nClaimed, error: ne } = await supabase.rpc("claim_event_nudges", { p_limit: BATCH, p_max_age_hours: 24 });
    if (ne) throw new Error(`Couldn't claim report reminders: ${ne.message}`);
    const nIds = ((nClaimed ?? []) as { id: number }[]).map((n) => n.id);
    if (nIds.length) {
      const { data: rows, error: re } = await supabase
        .from("event_nudges")
        .select("id, attempts, whatsapp_e164, boas(name, whatsapp_e164, active), events(id, title, event_date, event_end_date, event_date_text, report_filled, universities(name, code))")
        .in("id", nIds);
      if (re) {
        await supabase.from("event_nudges").update({ status: "queued", claimed_at: null }).in("id", nIds);
        throw new Error(`Couldn't read report reminders: ${re.message}`);
      }
      type NRow = {
        id: number; attempts: number; whatsapp_e164: string | null;
        boas: { name: string; whatsapp_e164: string | null; active: boolean } | null;
        events: {
          id: string; title: string | null; event_date: string | null; event_end_date: string | null; event_date_text: string | null;
          report_filled: number; universities: { name: string; code: string } | null;
        } | null;
      };
      const update = (id: number, patch: Record<string, unknown>) => supabase.from("event_nudges").update(patch).eq("id", id);
      const skip = async (id: number, reason: string) => {
        await update(id, { status: "skipped", error: reason, claimed_at: null });
        reports.skipped++;
      };
      await pool((rows ?? []) as unknown as NRow[], CONCURRENCY, async (n) => {
        if (fatal || Date.now() - started > TIME_BUDGET_MS) {
          await update(n.id, { status: "queued", claimed_at: null, attempts: Math.max(0, n.attempts - 1) });
          return;
        }
        const e = n.events;
        if (!e || !e.universities) return skip(n.id, "Event no longer exists");
        if (e.report_filled >= REPORT_TOTAL) return skip(n.id, "Report already complete");
        if (!n.boas?.active) return skip(n.id, "Staff member is inactive");
        const to = n.boas.whatsapp_e164 || n.whatsapp_e164;
        if (!to) return skip(n.id, "No WhatsApp number on the staff record");
        if (blockedByTest(to)) return skip(n.id, "Test mode — number not on the test list");
        const when = e.event_end_date && e.event_end_date !== e.event_date
          ? `${fmtEventDate(e.event_date)} – ${fmtEventDate(e.event_end_date)}`
          : fmtEventDate(e.event_date) || e.event_date_text || "";
        const { params, button } = eventParams({
          boa_name: n.boas.name, event_id: e.id, title: e.title,
          university_name: e.universities.name, university_code: e.universities.code, when,
        });
        try {
          const id = await sendTemplate(cfg, to, cfg.templates.event, params, button);
          await update(n.id, { status: "sent", wa_message_id: id, sent_at: new Date().toISOString(), error: null, delivery_status: "sent", claimed_at: null });
          reports.sent++;
        } catch (err) {
          const w = err instanceof WaError ? err : new WaError(String(err), null, false, false);
          if (w.fatal) fatal = w.message;
          const giveUp = (w.permanent && !w.fatal) || n.attempts >= MAX_ATTEMPTS;
          await update(n.id, { status: giveUp ? "failed" : "queued", error: w.message, claimed_at: null });
          if (giveUp) reports.failed++;
          else reports.retry++;
        }
      });
    }
  }

  return { ran: true, reminders, reports, fatal };
}

export function describeWhatsAppRun(r: SenderResult): string {
  if (!r.ran) return r.note ?? "Nothing to do.";
  if (r.quiet) return `Quiet hours — ${r.quietSkipped ?? 0} reminder${r.quietSkipped === 1 ? "" : "s"} skipped, nothing sent.`;
  const part = (label: string, t: Tally) => {
    const bits = [`${t.sent} sent`];
    if (t.failed) bits.push(`${t.failed} failed`);
    if (t.retry) bits.push(`${t.retry} will retry`);
    if (t.skipped) bits.push(`${t.skipped} skipped`);
    return `${label}: ${bits.join(", ")}`;
  };
  const msg = `${part("Publish reminders", r.reminders)} · ${part("Report reminders", r.reports)}.`;
  return r.fatal ? `Stopped — ${r.fatal} (${msg})` : msg;
}

export async function recordWhatsAppRun(supabase: DB, ok: boolean, message: string) {
  await supabase
    .from("app_settings")
    .update({ last_whatsapp_run_at: new Date().toISOString(), last_whatsapp_run_ok: ok, last_whatsapp_run_message: message.slice(0, 500) })
    .eq("id", 1);
}
