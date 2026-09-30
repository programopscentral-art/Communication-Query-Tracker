import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { ViewInSheet } from "@/components/ViewInSheet";
import { ReportBadge, ReportMeter, DetailsCard, EventWhen } from "@/components/events/EventBits";
import { EventDetailsForm, EventReportForm, DeleteEventButton } from "@/components/events/EventForms";
import { loadEventOptions } from "@/lib/eventOptions";
import { periodLabel } from "@/lib/events";
import { fmtIST } from "@/lib/format";

export default async function AdminEvent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const canEdit = isFullAdmin(await requireAdmin());
  const { id } = await params;
  const { created } = await searchParams;
  const supabase = await createClient();

  const { data: ev } = await supabase.from("events").select("*, universities(name, code)").eq("id", id).maybeSingle();
  if (!ev) notFound();
  const uni = ev.universities as { name: string; code: string } | null;

  const people = [ev.updated_by, ev.report_updated_by, ev.created_by].filter(Boolean) as string[];
  const [{ data: unis }, options, { data: users }, { data: settings }] = await Promise.all([
    supabase.from("universities").select("id, name").order("name"),
    canEdit ? loadEventOptions(supabase) : Promise.resolve({} as Record<string, string[]>),
    people.length ? supabase.from("app_users").select("id, full_name, email").in("id", people) : Promise.resolve({ data: [] }),
    supabase.from("app_settings").select("events_sheet_id").eq("id", 1).single(),
  ]);
  const name = (uid: string | null) => {
    if (!uid) return "the Google Sheet";
    const u = (users ?? []).find((x) => x.id === uid);
    return u?.full_name ?? u?.email ?? "a team member";
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href={`/admin/events?month=${String(ev.period).slice(0, 7)}`} className="font-ui text-sm text-accent hover:underline">
          ← Event reports · {periodLabel(ev.period)}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow mb-1">{uni?.name ?? ev.university_raw ?? "Unlinked"} · <EventWhen date={ev.event_date} end={ev.event_end_date} text={ev.event_date_text} /></p>
            <h1 className="break-words font-display text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{ev.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ReportBadge filled={ev.report_filled} />
              <ReportMeter filled={ev.report_filled} />
              {ev.sheet_missing_since && <span className="rounded-full bg-red-100 px-2 py-0.5 font-ui text-xs text-danger">No longer in the sheet</span>}
            </div>
          </div>
          {canEdit && <DeleteEventButton id={ev.id} fromSheet={ev.origin === "sheet" && !ev.sheet_missing_since} />}
        </div>
        {created && <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-2.5 font-ui text-sm text-success">Event created ✓ — the university can now fill its report.</p>}
      </Reveal>

      {/* provenance */}
      <Reveal delay={0.04} className="mt-6">
        <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-3 font-ui text-xs text-muted">
          <span>
            {ev.origin === "sheet" ? (
              <>From the sheet · <b className="text-ink">{ev.source_tab}</b> row {ev.source_row}{ev.sheet_key ? ` · Unique Key ${ev.sheet_key}` : ""}</>
            ) : (
              <>Added in PingBoard by {name(ev.created_by)}</>
            )}
            {" · "}Details last changed {fmtIST(ev.updated_at)} by {name(ev.updated_by)}
            {ev.report_updated_at && <> · Report last updated {fmtIST(ev.report_updated_at)} by {name(ev.report_updated_by)}</>}
          </span>
          {ev.origin === "sheet" && <ViewInSheet sheetId={settings?.events_sheet_id} gid={ev.source_gid} row={ev.source_row} />}
        </div>
      </Reveal>

      {/* details */}
      <Reveal delay={0.06} className="mt-6">
        <h2 className="mb-3 font-ui text-sm font-semibold text-ink">Event details <span className="font-normal text-muted">· Student Engagement team</span></h2>
        {canEdit ? (
          <EventDetailsForm mode="edit" event={ev} universities={(unis ?? []).map((u) => ({ value: u.id as string, label: u.name as string }))} options={options} />
        ) : (
          <div className="card space-y-4 p-6">
            <DetailsCard event={ev} universityName={uni?.name} />
            {(ev.zoho_status || ev.admin_comments) && (
              <p className="border-t border-line pt-3 font-ui text-sm text-muted">
                {ev.zoho_status && <>Loaded to Zoho: <b className="text-ink">{ev.zoho_status}</b>. </>}
                {ev.admin_comments && <>Reviewer comments: <span className="text-ink">{ev.admin_comments}</span></>}
              </p>
            )}
          </div>
        )}
      </Reveal>

      {/* report */}
      <Reveal delay={0.1} className="mt-8">
        <h2 className="mb-3 font-ui text-sm font-semibold text-ink">
          Event report <span className="font-normal text-muted">· filled by {uni?.name ?? "the university"}&apos;s staff</span>
        </h2>
        <EventReportForm event={ev} canEdit={canEdit} />
        {uni && (
          <p className="mt-2 font-ui text-xs text-muted">
            Staff see this on their board: <Link href={`/u/${uni.code}/events/${ev.id}`} className="text-accent hover:underline">/u/{uni.code}/events</Link>
          </p>
        )}
      </Reveal>
    </div>
  );
}
