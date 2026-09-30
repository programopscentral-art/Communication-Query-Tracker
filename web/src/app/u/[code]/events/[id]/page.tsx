import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUniversityAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { ReportBadge, ReportMeter, DetailsCard, EventWhen } from "@/components/events/EventBits";
import { EventReportForm } from "@/components/events/EventForms";
import { periodLabel } from "@/lib/events";
import { fmtIST } from "@/lib/format";

export default async function UniversityEvent({ params }: { params: Promise<{ code: string; id: string }> }) {
  const { code, id } = await params;
  const { canEdit } = await requireUniversityAccess(code);
  const supabase = await createClient();

  const { data: ev } = await supabase.from("events").select("*, universities(name, code)").eq("id", id).maybeSingle();
  if (!ev) notFound();
  const uni = ev.universities as { name: string; code: string } | null;
  // an event is always viewed under its own university (edit rights are per-university)
  if (uni && uni.code !== code) redirect(`/u/${uni.code}/events/${id}`);
  if (!uni) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href={`/u/${code}/events?month=${String(ev.period).slice(0, 7)}`} className="font-ui text-sm text-accent hover:underline">
          ← Events · {periodLabel(ev.period)}
        </Link>
        <p className="eyebrow mb-1 mt-3"><EventWhen date={ev.event_date} end={ev.event_end_date} text={ev.event_date_text} /></p>
        <h1 className="break-words font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{ev.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ReportBadge filled={ev.report_filled} />
          <ReportMeter filled={ev.report_filled} />
          {ev.report_updated_at && <span className="font-ui text-xs text-muted">Last updated {fmtIST(ev.report_updated_at)}</span>}
        </div>
      </Reveal>

      <Reveal delay={0.05} className="mt-6">
        <div className="card space-y-4 p-6">
          <p className="font-ui text-xs font-semibold uppercase tracking-wider text-muted">Event details · from the Student Engagement team</p>
          <DetailsCard event={ev} universityName={uni.name} />
          {ev.admin_comments && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 font-ui text-sm text-amber-900">
              <b>Note from the Student Engagement team:</b> {ev.admin_comments}
            </p>
          )}
        </div>
      </Reveal>

      <Reveal delay={0.08} className="mt-8">
        <h2 className="mb-1 font-ui text-sm font-semibold text-ink">Your event report</h2>
        <p className="mb-3 font-ui text-xs text-muted">
          Fill these after the event. The 7 key fields (description, registrations, participants, feedback, highlights,
          improvements, photos) make the report complete.
        </p>
        <EventReportForm event={ev} canEdit={canEdit} />
      </Reveal>
    </div>
  );
}
