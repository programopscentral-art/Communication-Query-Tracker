import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { istWindow, dateWindow, isViewKey, REMINDER_TABS, REMINDER_DROPDOWN, type ViewKey } from "@/lib/time";
import { Reveal } from "@/components/ui/Reveal";
import { ViewTabs } from "@/components/ViewTabs";
import { DateSearch } from "@/components/DateSearch";
import { UniSelect } from "@/components/UniSelect";

type Job = {
  job_id: string;
  status: string;
  offset_min: number;
  attempts: number;
  fire_at: string;
  publish_at: string | null;
  boa_name: string;
  channel: string | null;
  content_type: string | null;
  university_name: string;
  university_code: string;
};

const TONE: Record<string, string> = {
  sent: "text-success",
  failed: "text-danger",
  pending: "text-warn",
  sending: "text-info",
  skipped: "text-muted",
  cancelled: "text-muted",
};

export default async function ReminderLog({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string; uni?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: unis } = await supabase.from("universities").select("id, name, code").order("name");

  const view: ViewKey | null = isViewKey(sp.view) ? sp.view : null;
  const win = sp.date
    ? dateWindow(sp.date)
    : view
      ? istWindow(view)
      : { gte: new Date().toISOString(), lt: null };

  let q = supabase
    .from("reminder_job_details")
    .select("job_id, status, offset_min, attempts, fire_at, publish_at, boa_name, channel, content_type, university_name, university_code")
    .order("fire_at", { ascending: true })
    .limit(300);
  if (win.gte) q = q.gte("fire_at", win.gte);
  if (win.lt) q = q.lt("fire_at", win.lt);
  if (sp.uni) q = q.eq("university_code", sp.uni);
  const { data } = await q;
  const jobs = (data ?? []) as Job[];

  // If filtered to a university with no staff, explain why it's empty.
  let noStaffForFilter = false;
  if (sp.uni) {
    const { count } = await supabase
      .from("university_boas")
      .select("boa_id, universities!inner(code)", { count: "exact", head: true })
      .eq("universities.code", sp.uni);
    noStaffForFilter = (count ?? 0) === 0;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Delivery</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Reminder log</h1>
        <p className="mt-2 font-ui text-sm text-muted">Every WhatsApp reminder across universities, by fire time.</p>
      </Reveal>

      <Reveal delay={0.05} className="mt-6 flex flex-wrap items-center gap-3">
        <ViewTabs current={view ?? "today"} tabs={REMINDER_TABS} dropdown={REMINDER_DROPDOWN} />
        <UniSelect options={unis ?? []} current={sp.uni ?? ""} />
        <DateSearch />
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left font-ui text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3">University</th>
                  <th className="px-4 py-3">BOA</th>
                  <th className="px-4 py-3">Reminder fires</th>
                  <th className="px-4 py-3">Offset</th>
                  <th className="px-4 py-3">Publish At</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {jobs.map((j) => (
                  <tr key={j.job_id} className="transition-colors hover:bg-canvas">
                    <td className="px-6 py-3 text-ink">{j.university_name}</td>
                    <td className="px-4 py-3 text-muted">{j.boa_name}</td>
                    <td className="px-4 py-3 text-ink">{fmtIST(j.fire_at)}</td>
                    <td className="px-4 py-3 tabular-nums">{j.offset_min}m</td>
                    <td className="px-4 py-3 text-muted">{fmtIST(j.publish_at)}</td>
                    <td className={`px-6 py-3 font-ui font-semibold ${TONE[j.status] ?? ""}`}>{j.status}</td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted">
                      {noStaffForFilter
                        ? "This university has no staff assigned yet — add a BOA (Staff tab) to enable reminders."
                        : sp.date
                          ? "No reminders on that date."
                          : "No reminders in this window."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
