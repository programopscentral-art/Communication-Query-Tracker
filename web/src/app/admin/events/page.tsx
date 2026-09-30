import Link from "next/link";
import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal, RevealGroup } from "@/components/ui/Reveal";
import { StatCard } from "@/components/ui/StatCard";
import { ButtonLink } from "@/components/ui/Button";
import { UniSelect } from "@/components/UniSelect";
import { ParamSelect } from "@/components/ParamSelect";
import { ViewInSheet } from "@/components/ViewInSheet";
import { ReportBadge, ReportMeter, EventWhen, Completion } from "@/components/events/EventBits";
import { EventSyncButton, CampusMapRow, BulkZohoBar, ReminderSettingsForm, RunNudgesButtons } from "@/components/events/EventForms";
import {
  loadMonthStats, sumStats, monthOptions, listEvents, loadOverdue, loadOverdueCutoff, isOverdue,
  STATUS_OPTIONS, ZOHO_OPTIONS,
} from "@/lib/eventQueries";
import { loadNudgeSettings } from "@/lib/eventNudges";
import { periodLabel } from "@/lib/events";
import { fmtIST } from "@/lib/format";

type SP = { month?: string; uni?: string; status?: string; q?: string; zoho?: string; created?: string; deleted?: string; missing?: string };

export default async function AdminEvents({ searchParams }: { searchParams: Promise<SP> }) {
  const canEdit = isFullAdmin(await requireAdmin());
  const sp = await searchParams;
  const supabase = await createClient();

  const [stats, overdueRows, cutoff, nudgeSettings, { data: unis }, { data: settings }] = await Promise.all([
    loadMonthStats(supabase),
    loadOverdue(supabase),
    loadOverdueCutoff(supabase),
    loadNudgeSettings(supabase),
    supabase.from("universities").select("id, name, code").order("name"),
    supabase
      .from("app_settings")
      .select("events_sheet_id, last_event_sync_at, last_event_sync_ok, last_event_sync_message, last_event_sync_source, last_event_nudge_at, last_event_nudge_ok, last_event_nudge_message, last_event_nudge_source")
      .eq("id", 1)
      .single(),
  ]);
  const uniById = new Map((unis ?? []).map((u) => [u.id as string, u]));
  const uni = sp.uni ? (unis ?? []).find((u) => u.code === sp.uni) : undefined;
  const { defaultMonth, options: months } = monthOptions(stats);
  const month = sp.month ?? defaultMonth;
  const scopeStats = stats.filter(
    (r) => (month === "all" || r.period.startsWith(month)) && (!uni || r.university_id === uni.id),
  );
  const t = sumStats(scopeStats);
  const inScope = (r: { period: string; university_id: string | null }) =>
    (month === "all" || r.period.startsWith(month)) && (!uni || r.university_id === uni.id);
  const scopeOverdue = overdueRows.filter(inScope);
  const overdueTotal = scopeOverdue.reduce((n, r) => n + r.overdue, 0);
  const missingOnly = sp.missing === "1";

  const [events, quality, { data: nudges }] = await Promise.all([
    listEvents(supabase, { month, universityId: uni?.id, status: sp.status, q: sp.q, zoho: sp.zoho, missingOnly, overdueCutoff: cutoff }),
    loadQuality(supabase),
    supabase
      .from("event_nudges")
      .select("id, stage, status, created_at, event_id, events(title, universities(name)), boas(name)")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  // Export link carries the current filters.
  const exportQs = new URLSearchParams(
    Object.entries({ month, uni: sp.uni, status: sp.status, q: sp.q, zoho: sp.zoho, missing: sp.missing }).filter(
      (e): e is [string, string] => !!e[1],
    ),
  ).toString();

  // per-university completion for the chosen month (only when not filtered to one university)
  const perUni = new Map<string, { total: number; complete: number; partial: number; pending: number; overdue: number }>();
  for (const r of scopeStats) {
    const k = r.university_id ?? "unlinked";
    const a = perUni.get(k) ?? { total: 0, complete: 0, partial: 0, pending: 0, overdue: 0 };
    perUni.set(k, { ...a, total: a.total + r.total, complete: a.complete + r.complete, partial: a.partial + r.partial, pending: a.pending + r.pending });
  }
  for (const r of scopeOverdue) {
    const k = r.university_id ?? "unlinked";
    const a = perUni.get(k);
    if (a) a.overdue += r.overdue;
  }
  const uniRows = [...perUni.entries()]
    .map(([id, s]) => ({ id, name: id === "unlinked" ? "Not linked to a university" : uniById.get(id)?.name ?? "—", code: uniById.get(id)?.code, ...s }))
    .sort((a, b) => a.complete / (a.total || 1) - b.complete / (b.total || 1) || b.total - a.total);

  const sheetId = settings?.events_sheet_id as string | undefined;
  const scopeLabel = month === "all" ? "All months" : periodLabel(`${month}-01`);

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Student Engagement</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Event reports</h1>
            <p className="mt-2 max-w-2xl font-ui text-sm text-muted">
              The Student Engagement team fills the event details; each university&apos;s staff fills the report.
              Kept in sync with the Event Reports sheet (read-only) — edits here are kept unless the sheet changes the same field.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {sheetId && (
              <a href={`https://docs.google.com/spreadsheets/d/${sheetId}/edit`} target="_blank" rel="noopener noreferrer" className="font-ui text-sm font-semibold text-muted hover:text-ink">
                Open sheet ↗
              </a>
            )}
            {canEdit && <ButtonLink href="/admin/events/new" size="sm">+ New event</ButtonLink>}
          </div>
        </div>
      </Reveal>

      {(sp.created || sp.deleted) && (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 font-ui text-sm text-success">
          {sp.created ? `Created ${sp.created} event${sp.created === "1" ? "" : "s"} ✓` : "Event deleted ✓"}
        </p>
      )}

      {/* sync status */}
      <Reveal delay={0.03} className="mt-6">
        <div className={`card flex flex-wrap items-center justify-between gap-3 px-5 py-4 ${settings?.last_event_sync_ok === false ? "border-danger/40 bg-red-50" : ""}`}>
          <div className="font-ui text-sm">
            <span className="font-semibold text-ink">Sheet sync:</span>{" "}
            {settings?.last_event_sync_at ? (
              <>
                <span className="text-muted">
                  {fmtIST(settings.last_event_sync_at as string)} · {settings.last_event_sync_source === "auto" ? "automatic" : "manual"} —{" "}
                </span>
                <span className={settings.last_event_sync_ok ? "text-ink" : "text-danger"}>
                  {settings.last_event_sync_ok ? settings.last_event_sync_message : `Failed — ${settings.last_event_sync_message}`}
                </span>
              </>
            ) : (
              <span className="text-muted">not run yet</span>
            )}
          </div>
          {canEdit && <EventSyncButton />}
        </div>
      </Reveal>

      {/* filters */}
      <Reveal delay={0.05} className="mt-6 flex flex-wrap items-center gap-3">
        <ParamSelect param="month" label="Month" options={months} current={month} />
        <UniSelect options={unis ?? []} current={sp.uni ?? ""} />
        <ParamSelect param="status" label="Report status" options={STATUS_OPTIONS} current={sp.status ?? ""} />
        <ParamSelect param="zoho" label="Zoho status" options={ZOHO_OPTIONS} current={sp.zoho ?? ""} />
        <form className="flex items-center gap-2" action="/admin/events" method="get">
          {month && <input type="hidden" name="month" value={month} />}
          {sp.uni && <input type="hidden" name="uni" value={sp.uni} />}
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          {sp.zoho && <input type="hidden" name="zoho" value={sp.zoho} />}
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Search title / category…" className="filter-input w-52" />
        </form>
        {(sp.uni || sp.status || sp.q || sp.zoho || missingOnly) && (
          <Link href={`/admin/events?month=${month}`} className="font-ui text-sm text-muted hover:text-ink">Clear filters</Link>
        )}
        <div className="ml-auto flex items-center gap-2">
          <a href={`/admin/events/export?${exportQs}&format=xlsx`} className="rounded-full border border-line px-3.5 py-2 font-ui text-xs font-semibold text-ink hover:border-accent hover:text-accent">
            ⬇ Excel
          </a>
          <a href={`/admin/events/export?${exportQs}&format=csv`} className="rounded-full border border-line px-3.5 py-2 font-ui text-xs font-semibold text-ink hover:border-accent hover:text-accent">
            ⬇ CSV
          </a>
        </div>
      </Reveal>

      {/* stats */}
      <RevealGroup className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label={`Events · ${scopeLabel}`} value={t.total} tone="ink" />
        <StatCard label="Reports complete" value={t.complete} tone="green" />
        <StatCard label="In progress" value={t.partial} tone="blue" />
        <StatCard label="Pending" value={t.pending} tone="amber" />
        <StatCard label="Overdue" value={overdueTotal} tone="red" hint={`past ${nudgeSettings.after} days, incomplete`} />
        <StatCard label="Completion %" value={t.total ? Math.round((t.complete / t.total) * 100) : 0} tone="accent" />
      </RevealGroup>

      {/* per-university completion */}
      {!uni && uniRows.length > 0 && (
        <Reveal delay={0.08} className="mt-8">
          <div className="card overflow-hidden">
            <div className="border-b border-line px-6 py-4">
              <h2 className="font-ui text-sm font-semibold text-ink">Report completion by university · {scopeLabel}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-canvas text-left font-ui text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-6 py-3">University</th>
                    <th className="px-4 py-3 text-right">Events</th>
                    <th className="px-4 py-3 text-right">Complete</th>
                    <th className="px-4 py-3 text-right">In progress</th>
                    <th className="px-4 py-3 text-right">Pending</th>
                    <th className="px-4 py-3 text-right">Overdue</th>
                    <th className="px-6 py-3">Completion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {uniRows.map((r) => (
                    <tr key={r.id} className="hover:bg-canvas">
                      <td className="px-6 py-2.5 font-medium">
                        {r.code ? (
                          <Link href={`/admin/events?month=${month}&uni=${r.code}`} className="text-ink hover:text-accent">{r.name}</Link>
                        ) : (
                          <span className="text-danger">{r.name}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.total}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-success">{r.complete}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-info">{r.partial}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${r.pending ? "font-semibold text-warn" : "text-muted"}`}>{r.pending}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {r.overdue && r.code ? (
                          <Link href={`/admin/events?month=${month}&uni=${r.code}&status=overdue`} className="font-semibold text-danger hover:underline">{r.overdue}</Link>
                        ) : (
                          <span className="text-muted">{r.overdue}</span>
                        )}
                      </td>
                      <td className="px-6 py-2.5"><Completion done={r.complete} total={r.total} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      )}

      {/* event list */}
      <Reveal delay={0.1} className="mt-8">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 className="font-ui text-sm font-semibold text-ink">
              {missingOnly ? "Removed from the sheet" : "Events"} · {scopeLabel}{uni ? ` · ${uni.name}` : ""}
            </h2>
            <span className="font-ui text-xs text-muted">{events.length}{events.length === 1000 ? "+ (narrow the filters)" : ""}</span>
          </div>
          {canEdit && events.length > 0 && <BulkZohoBar />}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-canvas text-left font-ui text-xs uppercase tracking-wider text-muted">
                <tr>
                  {canEdit && <th className="w-10 pl-6 pr-0 py-3"><span className="sr-only">Select</span></th>}
                  <th className={`${canEdit ? "pl-3" : "pl-6"} pr-4 py-3`}>Date</th>
                  <th className="px-4 py-3">University</th>
                  <th className="px-4 py-3">Event</th>
                  <th className="px-4 py-3">Conducted by · CMA</th>
                  <th className="px-4 py-3">Report</th>
                  <th className="px-4 py-3">Zoho</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-canvas">
                    {canEdit && (
                      <td className="pl-6 pr-0 py-3">
                        <input type="checkbox" name="ids" value={e.id} form="bulk-zoho" aria-label={`Select ${e.title}`} className="h-4 w-4 accent-[var(--color-accent)]" />
                      </td>
                    )}
                    <td className={`whitespace-nowrap ${canEdit ? "pl-3" : "pl-6"} pr-4 py-3 text-ink`}><EventWhen date={e.event_date} end={e.event_end_date} text={e.event_date_text} /></td>
                    <td className="px-4 py-3">{e.universities?.name ?? <span className="text-danger">{e.university_raw ?? "—"}</span>}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/events/${e.id}`} className="font-medium text-ink hover:text-accent">{e.title}</Link>
                      <p className="text-xs text-muted">{[e.category, e.subcategory, e.mode].filter(Boolean).join(" · ")}</p>
                      {e.sheet_missing_since && <span className="mt-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-danger">No longer in the sheet</span>}
                      {e.origin === "ui" && <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-accent">Added in app</span>}
                    </td>
                    <td className="px-4 py-3 text-muted">{[e.conducted_by, e.cma_assigned].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <ReportBadge filled={e.report_filled} />
                        <ReportMeter filled={e.report_filled} />
                        {isOverdue(e, cutoff) && <span className="w-fit rounded-full bg-red-100 px-2 py-0.5 font-ui text-[11px] font-semibold text-danger">Overdue</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {/^(yes|done)$/i.test(e.zoho_status ?? "") ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 font-ui text-xs font-medium text-success">Loaded</span>
                      ) : (
                        <span className="font-ui text-xs text-muted">{e.zoho_status || "—"}</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link href={`/admin/events/${e.id}`} className="font-ui text-xs font-semibold text-accent hover:underline">Open →</Link>
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={canEdit ? 8 : 7} className="px-6 py-12 text-center text-muted">No events match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>

      {/* report reminders */}
      <Reveal delay={0.11} className="mt-8">
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-ui text-sm font-semibold text-ink">Report reminders</h2>
              <p className="mt-1 max-w-2xl font-ui text-xs text-muted">
                Every day at 10:00 IST, staff of each university are reminded about reports still incomplete{" "}
                <b className="text-ink">{nudgeSettings.after} days</b> after the event, and again (escalated) after{" "}
                <b className="text-ink">{nudgeSettings.escalate} days</b> — for events in the last {nudgeSettings.lookback} days.
                Each person gets at most one reminder per stage per event.{" "}
                <span className="text-warn">WhatsApp delivery starts once WhatsApp goes live — until then reminders are queued and logged here.</span>
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 font-ui text-xs font-semibold ${nudgeSettings.enabled ? "bg-green-100 text-success" : "bg-line-soft text-muted"}`}>
              {nudgeSettings.enabled ? "On" : "Off"}
            </span>
          </div>

          <p className="mt-3 font-ui text-xs text-muted">
            <span className="font-semibold text-ink">Last run:</span>{" "}
            {settings?.last_event_nudge_at ? (
              <>
                {fmtIST(settings.last_event_nudge_at as string)} · {settings.last_event_nudge_source === "auto" ? "automatic" : "manual"} —{" "}
                <span className={settings.last_event_nudge_ok ? "text-ink" : "text-danger"}>{settings.last_event_nudge_message}</span>
              </>
            ) : (
              "not run yet"
            )}
          </p>

          {canEdit && (
            <div className="mt-5 grid gap-6 border-t border-line pt-5 lg:grid-cols-2">
              <ReminderSettingsForm settings={nudgeSettings} />
              <div>
                <p className="mb-2 font-ui text-xs text-muted">
                  <b className="text-ink">Preview</b> shows what would be queued without queuing anything.
                </p>
                <RunNudgesButtons />
              </div>
            </div>
          )}

          <div className="mt-5 border-t border-line pt-4">
            <p className="mb-2 font-ui text-xs font-semibold uppercase tracking-wider text-muted">Latest reminders</p>
            <ul className="divide-y divide-line-soft">
              {((nudges ?? []) as unknown as {
                id: number; stage: string; status: string; created_at: string; event_id: string;
                events: { title: string; universities: { name: string } | null } | null; boas: { name: string } | null;
              }[]).map((n) => (
                <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2 font-ui text-xs">
                  <span className="min-w-0">
                    <b className="text-ink">{n.boas?.name ?? "—"}</b>
                    <span className="text-muted"> · {n.events?.universities?.name} · </span>
                    <Link href={`/admin/events/${n.event_id}`} className="text-ink hover:text-accent">{n.events?.title ?? "event"}</Link>
                  </span>
                  <span className="flex items-center gap-2 text-muted">
                    <span className={`rounded-full px-2 py-0.5 ${n.stage === "overdue" ? "bg-red-100 text-danger" : "bg-amber-100 text-amber-800"}`}>
                      {n.stage === "overdue" ? "Escalation" : "Reminder"}
                    </span>
                    <span>{n.status}</span>
                    <span>{fmtIST(n.created_at)}</span>
                  </span>
                </li>
              ))}
              {(nudges ?? []).length === 0 && <li className="py-2 text-sm text-muted">No reminders yet.</li>}
            </ul>
          </div>
        </div>
      </Reveal>

      {/* data quality */}
      <Reveal delay={0.12} className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-ui text-sm font-semibold text-ink">Campus names in the sheet</h2>
          <p className="mb-3 mt-1 font-ui text-xs text-muted">
            How each name the team types maps to a university. {canEdit ? "Change a mapping to relink all its events." : ""}
          </p>
          <div className="divide-y divide-line-soft">
            {quality.campus.map((c) =>
              canEdit ? (
                <CampusMapRow key={c.raw} raw={c.raw} current={c.university_id} count={c.n} universities={(unis ?? []).map((u) => ({ value: u.id as string, label: u.name as string }))} />
              ) : (
                <p key={c.raw} className="py-2 font-ui text-sm">
                  {c.raw} <span className="text-muted">({c.n}) → </span>
                  {c.university_id ? uniById.get(c.university_id)?.name : <span className="text-danger">not mapped</span>}
                </p>
              ),
            )}
            {quality.campus.length === 0 && <p className="py-2 text-sm text-muted">No events yet.</p>}
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-ui text-sm font-semibold text-ink">Removed from the sheet ({quality.missing})</h2>
            <p className="mt-1 font-ui text-xs text-muted">
              Events that were in the sheet but aren&apos;t any more. They&apos;re kept here (with any report) until you delete them.
            </p>
            {quality.missing > 0 && (
              <Link href={`/admin/events?month=all&missing=1`} className="mt-2 inline-block font-ui text-sm font-semibold text-accent hover:underline">Review them →</Link>
            )}
          </div>

          <div className="card p-6">
            <h2 className="font-ui text-sm font-semibold text-ink">Dates to check in the sheet ({quality.dates.length})</h2>
            <ul className="mt-2 space-y-1.5">
              {quality.dates.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 font-ui text-xs">
                  <Link href={`/admin/events/${d.id}`} className="min-w-0 truncate text-ink hover:text-accent">
                    {d.source_tab} · &ldquo;{d.event_date_text}&rdquo; — {d.issue === "unreadable" ? "couldn't read this date" : `filed under ${periodLabel(d.period)}`}
                  </Link>
                  <ViewInSheet compact sheetId={sheetId} gid={d.source_gid} row={d.source_row} />
                </li>
              ))}
              {quality.dates.length === 0 && <li className="text-sm text-muted">All dates look fine.</li>}
            </ul>
          </div>

          <div className="card p-6">
            <h2 className="font-ui text-sm font-semibold text-ink">Duplicate Unique Keys in the sheet ({quality.dupKeys.length})</h2>
            <p className="mt-1 font-ui text-xs text-muted">The same key on several rows — those rows are matched by their content instead. Give each row its own key in the sheet.</p>
            <ul className="mt-2 space-y-1 font-ui text-xs text-ink">
              {quality.dupKeys.map((k) => <li key={k.key}><b>{k.key}</b> <span className="text-muted">— {k.rows}</span></li>)}
              {quality.dupKeys.length === 0 && <li className="text-sm text-muted">None.</li>}
            </ul>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadQuality(supabase: any) {
  const [{ data: campus }, { data: dates }, { data: dupKeys }, { count: missing }] = await Promise.all([
    supabase.from("v_event_campus_names").select("university_raw, university_id, n").order("n", { ascending: false }),
    supabase.from("v_event_date_issues").select("id, title, period, event_date_text, source_tab, source_row, source_gid, issue").limit(30),
    supabase.from("v_event_duplicate_keys").select("key, n, rows"),
    supabase.from("events").select("id", { count: "exact", head: true }).not("sheet_missing_since", "is", null),
  ]);
  // one row per written name (a name could map to 2 universities after a manual edit)
  const seen = new Map<string, { raw: string; university_id: string | null; n: number }>();
  for (const c of (campus ?? []) as { university_raw: string; university_id: string | null; n: number }[]) {
    const prev = seen.get(c.university_raw);
    if (!prev || c.n > prev.n) seen.set(c.university_raw, { raw: c.university_raw, university_id: c.university_id, n: c.n + (prev?.n ?? 0) });
  }
  return {
    campus: [...seen.values()],
    dates: (dates ?? []) as { id: string; title: string; period: string; event_date_text: string; source_tab: string; source_row: number; source_gid: string | null; issue: string }[],
    dupKeys: (dupKeys ?? []) as { key: string; n: number; rows: string }[],
    missing: missing ?? 0,
  };
}
