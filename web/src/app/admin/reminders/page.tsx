import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { Reveal } from "@/components/ui/Reveal";

type Job = {
  job_id: string;
  status: string;
  offset_min: number;
  attempts: number;
  boa_name: string;
  university_name: string;
  publish_at: string | null;
};

const TONE: Record<string, string> = {
  sent: "text-success",
  failed: "text-danger",
  pending: "text-warn",
  sending: "text-info",
  skipped: "text-muted",
  cancelled: "text-muted",
};

export default async function ReminderLog() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reminder_job_details")
    .select("job_id, status, offset_min, attempts, boa_name, university_name, publish_at")
    .order("publish_at", { ascending: false })
    .limit(200);

  const jobs = (data ?? []) as Job[];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Delivery</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Reminder log</h1>
        <p className="mt-2 font-ui text-sm text-muted">Every WhatsApp reminder, sent or scheduled.</p>
      </Reveal>

      <Reveal delay={0.06} className="mt-6">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left font-ui text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3">University</th>
                  <th className="px-4 py-3">BOA</th>
                  <th className="px-4 py-3">Offset</th>
                  <th className="px-4 py-3">Publish At</th>
                  <th className="px-4 py-3">Attempts</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {jobs.map((j) => (
                  <tr key={j.job_id} className="transition-colors hover:bg-canvas">
                    <td className="px-6 py-3 text-ink">{j.university_name}</td>
                    <td className="px-4 py-3 text-muted">{j.boa_name}</td>
                    <td className="px-4 py-3 tabular-nums">{j.offset_min}m</td>
                    <td className="px-4 py-3 text-muted">{fmtIST(j.publish_at)}</td>
                    <td className="px-4 py-3 tabular-nums">{j.attempts}</td>
                    <td className={`px-6 py-3 font-ui font-semibold ${TONE[j.status] ?? ""}`}>{j.status}</td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-muted">
                      No reminders yet — they appear once tasks have BOAs assigned and publish times approaching.
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
