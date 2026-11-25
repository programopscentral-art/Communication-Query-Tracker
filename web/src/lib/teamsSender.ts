import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildReminderCard,
  inQuietWindow,
  isTaggableEmail,
  NOT_TAGGED_REASON,
  scrub,
  type PostResult,
} from "@/lib/teamsCard";

// Delivers due post reminders as Teams cards: ONE card per post per reminder
// timing, to the university's channel, @mentioning its eligible staff.
// Called every minute by pg_cron (migration 0040, only when something is due)
// via /api/cron/send-teams, with the service-role client.
//
// Safety rules, in order:
//  1. Master switch off → do nothing (claim_teams_reminders also refuses).
//  2. Quiet hours (IST) → reminders falling due are skipped, not delayed.
//  3. More than `max_late` minutes late → skipped "Too late" (in the claim), so an
//     old backlog is never blasted.
//  4. Post already published → skipped. University's Teams toggle off / no
//     webhook → skipped. Inactive staff → skipped.
//  5. Staff without a valid @nxtwave.co.in email → named on the card but not
//     tagged; their reminder is marked skipped with the reason.
//  6. Temporary errors (timeout, 429, 5xx) → retried while still within the
//     lateness window (max 4 attempts); a revoked / switched-off webhook marks
//     that university red on Admin → Teams and fails its cards for this run.
// The webhook URL never leaves get_teams_webhook() → postToTeams().

export type TeamsSettings = { enabled: boolean; quietStart: string; quietEnd: string; maxLateMin: number };

export type ClaimedJob = { id: string; task_id: string; boa_id: string; offset_min: number; attempts: number };
export type TaskRow = {
  id: string;
  university_id: string;
  channel: string | null;
  content_type: string | null;
  priority: string | null;
  publish_at: string | null;
  execution_status: string | null;
  batches: string[] | null;
  universities: { id: string; name: string; code: string } | null;
};
export type StaffRow = { id: string; name: string; email: string | null; active: boolean };
export type CardLog = {
  kind: "reminder" | "test";
  university_id: string;
  task_id: string | null;
  offset_min: number | null;
  ok: boolean;
  http_status: number | null;
  mentioned: number;
  not_tagged: number;
  error: string | null;
  sent_by?: string | null;
};

/** Everything the sender needs from the database (a plain interface so it can be tested in memory). */
export interface TeamsStore {
  claim(limitGroups: number, maxLateMin: number): Promise<ClaimedJob[]>;
  skipDue(reason: string, maxLateMin: number): Promise<number>;
  tasks(ids: string[]): Promise<TaskRow[]>;
  staff(ids: string[]): Promise<StaffRow[]>;
  enabledUniversities(ids: string[]): Promise<Set<string>>;
  webhook(universityId: string): Promise<string | null>;
  updateJobs(ids: string[], patch: Record<string, unknown>): Promise<void>;
  logCard(row: CardLog): Promise<string | null>;
  setChannelError(universityId: string, message: string | null): Promise<void>;
}

export type Post = (url: string, payload: unknown) => Promise<PostResult>;

export type Tally = { cards: number; cardsFailed: number; sent: number; notTagged: number; skipped: number; failed: number; retry: number };
export type TeamsRunResult = { ran: boolean; note?: string; quiet?: boolean; quietSkipped?: number; tally: Tally; broken: string[] };

const MAX_ATTEMPTS = 4;
const GROUPS_PER_RUN = 20;
const CONCURRENCY = 3;
const TIME_BUDGET_MS = 45_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = SupabaseClient<any>;

export async function loadTeamsSettings(supabase: DB): Promise<TeamsSettings> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("teams_enabled, teams_quiet_start, teams_quiet_end, teams_max_late_min")
    .eq("id", 1)
    .single();
  if (error) throw new Error(`Couldn't read Teams settings: ${error.message}`);
  return {
    enabled: !!data.teams_enabled,
    quietStart: String(data.teams_quiet_start ?? "22:00").slice(0, 5),
    quietEnd: String(data.teams_quiet_end ?? "08:00").slice(0, 5),
    maxLateMin: data.teams_max_late_min ?? 5,
  };
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

export async function runTeamsSender(
  store: TeamsStore,
  s: TeamsSettings,
  post: Post,
  clock: () => number = Date.now,
): Promise<TeamsRunResult> {
  const tally: Tally = { cards: 0, cardsFailed: 0, sent: 0, notTagged: 0, skipped: 0, failed: 0, retry: 0 };
  const broken = new Map<string, string>(); // university id → message
  const done = (r: Omit<TeamsRunResult, "tally" | "broken">): TeamsRunResult => ({ ...r, tally, broken: [...broken.values()] });

  if (!s.enabled) return done({ ran: false, note: "Teams reminders are switched off." });

  if (inQuietWindow(s.quietStart, s.quietEnd, new Date(clock()))) {
    const n = await store.skipDue(`Quiet hours — no Teams reminders ${s.quietStart}–${s.quietEnd} IST`, s.maxLateMin);
    return done({ ran: true, quiet: true, quietSkipped: n });
  }

  const started = clock();
  const claimed = await store.claim(GROUPS_PER_RUN, s.maxLateMin);
  if (!claimed.length) return done({ ran: true });

  const [tasks, staff] = await Promise.all([
    store.tasks([...new Set(claimed.map((j) => j.task_id))]),
    store.staff([...new Set(claimed.map((j) => j.boa_id))]),
  ]);
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const staffById = new Map(staff.map((b) => [b.id, b]));
  const enabled = await store.enabledUniversities([...new Set(tasks.map((t) => t.university_id))]);
  const cleared = new Set<string>();
  const urls = new Map<string, Promise<string | null>>();
  const urlFor = (uni: string) => {
    if (!urls.has(uni)) urls.set(uni, store.webhook(uni));
    return urls.get(uni)!;
  };

  const skip = async (jobs: ClaimedJob[], reason: string) => {
    if (!jobs.length) return;
    await store.updateJobs(jobs.map((j) => j.id), { status: "skipped", skip_reason: reason, claimed_at: null });
    tally.skipped += jobs.length;
  };
  const fail = async (jobs: ClaimedJob[], message: string) => {
    if (!jobs.length) return;
    await store.updateJobs(jobs.map((j) => j.id), { status: "failed", error: message, claimed_at: null });
    tally.failed += jobs.length;
  };

  // Group into cards: one per post + timing.
  const groups = new Map<string, ClaimedJob[]>();
  for (const j of claimed) {
    const k = `${j.task_id}|${j.offset_min}`;
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }

  await pool([...groups.values()], CONCURRENCY, async (jobs) => {
    if (clock() - started > TIME_BUDGET_MS) {
      // Out of time: hand these back untouched (attempt not counted).
      for (const j of jobs) await store.updateJobs([j.id], { status: "pending", claimed_at: null, attempts: Math.max(0, j.attempts - 1) });
      return;
    }
    const t = taskById.get(jobs[0].task_id);
    const uni = t?.universities;
    if (!t || !uni) return skip(jobs, "Task no longer exists");
    if (t.execution_status === "published") return skip(jobs, "Already published");
    if (!enabled.has(uni.id)) return skip(jobs, `Teams reminders are off for ${uni.name}`);
    if (broken.has(uni.id)) return fail(jobs, broken.get(uni.id)!);
    const url = await urlFor(uni.id);
    if (!url) return skip(jobs, `No Teams webhook saved for ${uni.name}`);

    const inactive = jobs.filter((j) => !staffById.get(j.boa_id)?.active);
    const active = jobs.filter((j) => staffById.get(j.boa_id)?.active);
    await skip(inactive, "Staff member is inactive");
    if (!active.length) return;

    const tagged = active.filter((j) => isTaggableEmail(staffById.get(j.boa_id)!.email));
    const untagged = active.filter((j) => !isTaggableEmail(staffById.get(j.boa_id)!.email));
    const person = (j: ClaimedJob) => staffById.get(j.boa_id)!;

    const payload = buildReminderCard({
      offsetMin: jobs[0].offset_min,
      university: uni.name,
      universityCode: uni.code,
      taskId: t.id,
      channel: t.channel,
      contentType: t.content_type,
      publishAt: t.publish_at,
      priority: t.priority,
      batches: t.batches,
      tagged: tagged.map((j) => ({ name: person(j).name, email: person(j).email! })),
      notTagged: untagged.map((j) => person(j).name),
    });

    const res = await post(url, payload);
    const message = scrub(res.message, 300);
    const cardId = await store.logCard({
      kind: "reminder",
      university_id: uni.id,
      task_id: t.id,
      offset_min: jobs[0].offset_min,
      ok: res.ok,
      http_status: res.status,
      mentioned: tagged.length,
      not_tagged: untagged.length,
      error: res.ok ? null : message,
    });

    if (res.ok) {
      tally.cards++;
      if (!cleared.has(uni.id)) {
        cleared.add(uni.id); // a working card clears an old red error on Admin → Teams
        await store.setChannelError(uni.id, null);
      }
      const now = new Date(clock()).toISOString();
      if (tagged.length) {
        await store.updateJobs(tagged.map((j) => j.id), {
          status: "sent", sent_via: "teams", teams_card_id: cardId, sent_at: now, error: null, skip_reason: null, claimed_at: null,
        });
        tally.sent += tagged.length;
      }
      if (untagged.length) {
        await store.updateJobs(untagged.map((j) => j.id), {
          status: "skipped", sent_via: "teams", teams_card_id: cardId, skip_reason: NOT_TAGGED_REASON, claimed_at: null,
        });
        tally.notTagged += untagged.length;
      }
      return;
    }

    tally.cardsFailed++;
    if (res.kind === "broken") {
      broken.set(uni.id, `${uni.name}: ${message}`);
      await store.setChannelError(uni.id, message);
      return fail(active, message);
    }
    if (res.kind === "retry") {
      const giveUp = active.filter((j) => j.attempts >= MAX_ATTEMPTS);
      const again = active.filter((j) => j.attempts < MAX_ATTEMPTS);
      await fail(giveUp, `${message} (gave up after ${MAX_ATTEMPTS} tries)`);
      if (again.length) {
        await store.updateJobs(again.map((j) => j.id), { status: "pending", error: message, claimed_at: null });
        tally.retry += again.length;
      }
      return;
    }
    return fail(active, message); // rejected (e.g. HTTP 400)
  });

  return done({ ran: true });
}

export function describeTeamsRun(r: TeamsRunResult): string {
  if (!r.ran) return r.note ?? "Nothing to do.";
  if (r.quiet) return `Quiet hours — ${r.quietSkipped ?? 0} reminder${r.quietSkipped === 1 ? "" : "s"} skipped, nothing sent.`;
  const t = r.tally;
  const bits = [`${t.cards} card${t.cards === 1 ? "" : "s"} posted (${t.sent} tagged)`];
  if (t.notTagged) bits.push(`${t.notTagged} not tagged (no valid email)`);
  if (t.cardsFailed) bits.push(`${t.cardsFailed} card${t.cardsFailed === 1 ? "" : "s"} failed`);
  if (t.failed) bits.push(`${t.failed} reminder${t.failed === 1 ? "" : "s"} failed`);
  if (t.retry) bits.push(`${t.retry} will retry`);
  if (t.skipped) bits.push(`${t.skipped} skipped`);
  const msg = bits.join(", ") + ".";
  return r.broken.length ? `Webhook problem — ${r.broken.join(" · ")} (${msg})` : msg;
}

export async function recordTeamsRun(supabase: DB, ok: boolean, message: string) {
  await supabase
    .from("app_settings")
    .update({ last_teams_run_at: new Date().toISOString(), last_teams_run_ok: ok, last_teams_run_message: scrub(message, 500) })
    .eq("id", 1);
}

/** The real store: service-role client (bypasses RLS; the claim/webhook functions are service-role only). */
export function supabaseTeamsStore(supabase: DB): TeamsStore {
  const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
    if (r.error) throw new Error(`Couldn't ${what}: ${r.error.message}`);
    return r.data as T;
  };
  return {
    async claim(limitGroups, maxLateMin) {
      return must(await supabase.rpc("claim_teams_reminders", { p_limit_groups: limitGroups, p_max_late_min: maxLateMin }), "claim reminders") ?? [];
    },
    async skipDue(reason, maxLateMin) {
      return must(await supabase.rpc("teams_skip_due", { p_reason: reason, p_max_late_min: maxLateMin }), "apply quiet hours") ?? 0;
    },
    async tasks(ids) {
      if (!ids.length) return [];
      return must(
        await supabase
          .from("tasks")
          .select("id, university_id, channel, content_type, priority, publish_at, execution_status, batches, universities(id, name, code)")
          .in("id", ids),
        "read posts",
      ) as unknown as TaskRow[];
    },
    async staff(ids) {
      if (!ids.length) return [];
      return must(await supabase.from("boas").select("id, name, email, active").in("id", ids), "read staff") as StaffRow[];
    },
    async enabledUniversities(ids) {
      if (!ids.length) return new Set();
      const rows = must(await supabase.from("university_teams").select("university_id").eq("enabled", true).in("university_id", ids), "read Teams channels") as { university_id: string }[];
      return new Set(rows.map((r) => r.university_id));
    },
    async webhook(universityId) {
      // Never include the URL in an error.
      const r = await supabase.rpc("get_teams_webhook", { p_university_id: universityId });
      if (r.error) throw new Error("Couldn't read the Teams webhook from the vault.");
      return (r.data as string | null) || null;
    },
    async updateJobs(ids, patch) {
      if (!ids.length) return;
      const r = await supabase.from("reminder_jobs").update(patch).in("id", ids);
      if (r.error) throw new Error(`Couldn't update reminders: ${r.error.message}`);
    },
    async logCard(row) {
      const r = await supabase.from("teams_cards").insert(row).select("id").single();
      return r.error ? null : (r.data as { id: string }).id;
    },
    async setChannelError(universityId, message) {
      await supabase
        .from("university_teams")
        .update(message ? { last_error: message, last_error_at: new Date().toISOString() } : { last_error: null, last_error_at: null })
        .eq("university_id", universityId);
    },
  };
}
