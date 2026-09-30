import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUniversityAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { ParamSelect } from "@/components/ParamSelect";
import { ReportBadge, ReportMeter, EventWhen } from "@/components/events/EventBits";
import {
  loadMonthStats, sumStats, monthOptions, listEvents, loadOverdue, loadOverdueCutoff, isOverdue, STATUS_OPTIONS,
} from "@/lib/eventQueries";
import { periodLabel } from "@/lib/events";

export default async function UniversityEvents({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ month?: string; status?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  const { canEdit } = await requireUniversityAccess(code);
  const supabase = await createClient();
  const { data: uni } = await supabase.from("universities").select("id, name").eq("code", code).single();
  if (!uni) notFound();

  const [stats, overdueRows, cutoff] = await Promise.all([
    loadMonthStats(supabase, uni.id),
    loadOverdue(supabase, uni.id),
    loadOverdueCutoff(supabase),
  ]);
  const { defaultMonth, options: months } = monthOptions(stats);
  const month = sp.month ?? defaultMonth;
  const all = sumStats(stats);
  const scope = sumStats(stats.filter((r) => month === "all" || r.period.startsWith(month)));
  const events = await listEvents(supabase, { month, universityId: uni.id, status: sp.status, overdueCutoff: cutoff });
  const open = all.pending + all.partial;
  const overdue = overdueRows.reduce((n, r) => n + r.overdue, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Event reports</p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{uni.name} — Events</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          The Student Engagement team adds each event. {canEdit ? "Your part: fill the report after the event." : "View only."}
        </p>
      </Reveal>

      {overdue > 0 ? (
        <Reveal delay={0.04} className="mt-6">
          <Link
            href={`/u/${code}/events?month=all&status=overdue`}
            className="card flex flex-wrap items-center justify-between gap-3 border-red-200 bg-red-50 px-5 py-4 transition-all hover:-translate-y-0.5"
          >
            <span className="font-ui text-sm text-red-900">
              <b>{overdue} event report{overdue === 1 ? " is" : "s are"} overdue</b> — the event ended and the report still isn&apos;t complete.
              {open > overdue && <> {open - overdue} more {open - overdue === 1 ? "is" : "are"} still to fill.</>}
            </span>
            <span className="font-ui text-sm font-semibold text-red-900">Fill them now →</span>
          </Link>
        </Reveal>
      ) : open > 0 ? (
        <Reveal delay={0.04} className="mt-6">
          <Link
            href={`/u/${code}/events?month=all&status=open`}
            className="card flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 px-5 py-4 transition-all hover:-translate-y-0.5"
          >
            <span className="font-ui text-sm text-amber-900">
              <b>{open} event report{open === 1 ? "" : "s"}</b> still to fill ({all.pending} not started, {all.partial} in progress)
            </span>
            <span className="font-ui text-sm font-semibold text-amber-900">Show them →</span>
          </Link>
        </Reveal>
      ) : null}

      <Reveal delay={0.06} className="mt-6 flex flex-wrap items-center gap-3">
        <ParamSelect param="month" label="Month" options={months} current={month} />
        <ParamSelect param="status" label="Report status" options={STATUS_OPTIONS} current={sp.status ?? ""} />
        <span className="font-ui text-sm text-muted">
          {month === "all" ? "All months" : periodLabel(`${month}-01`)}: {scope.total} events · {scope.complete} reports complete
        </span>
      </Reveal>

      <div className="mt-6 space-y-2">
        {events.map((e) => (
          <Link
            key={e.id}
            href={`/u/${code}/events/${e.id}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-card)]"
          >
            <div className="min-w-0">
              <p className="truncate font-ui text-sm font-semibold text-ink">{e.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                <EventWhen date={e.event_date} end={e.event_end_date} text={e.event_date_text} />
                {[e.category, e.subcategory, e.mode].filter(Boolean).map((x) => ` · ${x}`)}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {isOverdue(e, cutoff) ? (
                <span className="rounded-full bg-red-100 px-2 py-0.5 font-ui text-xs font-semibold text-danger">Overdue</span>
              ) : (
                <ReportBadge filled={e.report_filled} />
              )}
              <ReportMeter filled={e.report_filled} />
            </div>
          </Link>
        ))}
        {events.length === 0 && (
          <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
            No events here{sp.status ? " with that report status" : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
