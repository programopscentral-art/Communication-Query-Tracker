import { requireUniversityAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { istWindow, dateWindow, isViewKey, REMINDER_TABS, REMINDER_DROPDOWN, type ViewKey } from "@/lib/time";
import { Reveal } from "@/components/ui/Reveal";
import { ViewTabs } from "@/components/ViewTabs";
import { DateSearch } from "@/components/DateSearch";

type Job = {
  job_id: string;
  status: string;
  offset_min: number;
  fire_at: string;
  publish_at: string | null;
  channel: string | null;
  content_type: string | null;
  team: string | null;
  update_type: string | null;
};

const TONE: Record<string, string> = {
  sent: "text-success",
  pending: "text-warn",
  sending: "text-info",
  failed: "text-danger",
  skipped: "text-muted",
  cancelled: "text-muted",
};

export default async function MyReminders({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;
  await requireUniversityAccess(code);
  const supabase = await createClient();

  const view: ViewKey | null = isViewKey(sp.view) ? sp.view : null;
  // date search > tab > default (all upcoming from now)
  const win = sp.date
    ? dateWindow(sp.date)
    : view
      ? istWindow(view)
      : { gte: new Date().toISOString(), lt: null };

  let q = supabase
    .from("reminder_job_details")
    .select("job_id, status, offset_min, fire_at, publish_at, channel, content_type, team, update_type")
    .eq("university_code", code)
    .order("fire_at", { ascending: true })
    .limit(300);
  if (win.gte) q = q.gte("fire_at", win.gte);
  if (win.lt) q = q.lt("fire_at", win.lt);

  const [{ data }, { count: staffCount }] = await Promise.all([
    q,
    supabase
      .from("university_boas")
      .select("boa_id, universities!inner(code)", { count: "exact", head: true })
      .eq("universities.code", code),
  ]);
  const jobs = (data ?? []) as Job[];
  const noStaff = (staffCount ?? 0) === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Notifications</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">My reminders</h1>
        <p className="mt-2 font-ui text-sm text-muted">WhatsApp reminders scheduled for you, by when they fire.</p>
      </Reveal>

      <Reveal delay={0.05} className="mt-6 flex flex-wrap items-center gap-3">
        <ViewTabs current={view ?? "today"} tabs={REMINDER_TABS} dropdown={REMINDER_DROPDOWN} />
        <DateSearch />
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        <div className="card divide-y divide-line-soft">
          {jobs.map((j) => (
            <div key={j.job_id} className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="min-w-0">
                <p className="font-ui text-sm font-medium text-ink">
                  {[j.channel, j.content_type].filter(Boolean).join(" · ") || "Reminder"}
                </p>
                <p className="truncate text-xs text-muted">
                  {[j.team, j.update_type].filter(Boolean).join(" / ")}
                  {j.publish_at ? ` · publishes ${fmtIST(j.publish_at)}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-ui text-sm font-semibold text-ink">🔔 {fmtIST(j.fire_at)}</p>
                <p className="text-xs text-muted">
                  {j.offset_min} min before ·{" "}
                  <span className={`font-semibold ${TONE[j.status] ?? "text-muted"}`}>{j.status}</span>
                </p>
              </div>
            </div>
          ))}
          {jobs.length === 0 && (
            <div className="px-5 py-10 text-center text-sm text-muted">
              {noStaff ? (
                <>
                  <p className="font-ui font-semibold text-ink">No staff assigned to this university yet.</p>
                  <p className="mt-1">Reminders start automatically once a BOA is added to this university.</p>
                </>
              ) : sp.date ? (
                "No reminders on that date."
              ) : (
                "No reminders in this window."
              )}
            </div>
          )}
        </div>
      </Reveal>
    </div>
  );
}
