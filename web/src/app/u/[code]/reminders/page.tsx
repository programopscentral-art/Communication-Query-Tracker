import { requireAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { Reveal } from "@/components/ui/Reveal";

type Job = {
  job_id: string;
  status: string;
  offset_min: number;
  publish_at: string | null;
  channel: string | null;
  content_type: string | null;
  university_code: string;
};

const TONE: Record<string, string> = {
  sent: "text-success",
  pending: "text-warn",
  sending: "text-info",
  failed: "text-danger",
  skipped: "text-muted",
  cancelled: "text-muted",
};

export default async function MyReminders({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await requireAppUser();
  const supabase = await createClient();

  const { data } = await supabase
    .from("reminder_job_details")
    .select("job_id, status, offset_min, publish_at, channel, content_type, university_code")
    .eq("university_code", code)
    .order("publish_at", { ascending: false })
    .limit(100);

  const jobs = (data ?? []) as Job[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Notifications</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">My reminders</h1>
        <p className="mt-2 font-ui text-sm text-muted">WhatsApp reminders scheduled for you.</p>
      </Reveal>

      <Reveal delay={0.08} className="mt-6">
        <div className="card divide-y divide-line-soft">
          {jobs.map((j) => (
            <div key={j.job_id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="font-ui text-sm font-medium text-ink">
                  {[j.channel, j.content_type].filter(Boolean).join(" · ") || "Reminder"}
                </p>
                <p className="text-xs text-muted">
                  {j.offset_min} min before · {fmtIST(j.publish_at)}
                </p>
              </div>
              <span className={`font-ui text-xs font-semibold ${TONE[j.status] ?? "text-muted"}`}>
                {j.status}
              </span>
            </div>
          ))}
          {jobs.length === 0 && (
            <p className="px-5 py-10 text-center text-sm text-muted">
              No reminders scheduled yet.
            </p>
          )}
        </div>
      </Reveal>
    </div>
  );
}
