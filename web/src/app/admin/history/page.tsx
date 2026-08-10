import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { describeChange, type Changes } from "@/lib/activity";
import { Reveal } from "@/components/ui/Reveal";

type URow = {
  university_id: string;
  university: string;
  code: string;
  total: number;
  published: number;
  pending: number;
  overdue: number;
  blocked: number;
  staff_count: number;
  last_task_update: string | null;
};

type Activity = {
  id: number;
  created_at: string;
  actor_name: string;
  changes: Changes;
  university_name: string | null;
  university_code: string | null;
  channel: string | null;
};

export default async function HistoryHome() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: unis }, { data: acts }] = await Promise.all([
    supabase.from("v_university_history").select("*").order("last_task_update", { ascending: false, nullsFirst: false }),
    supabase.from("v_recent_activity").select("*").order("created_at", { ascending: false }).limit(25),
  ]);

  const universities = (unis ?? []) as URow[];
  const activity = (acts ?? []) as Activity[];

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Admin only · Audit</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          University & staff history
        </h1>
        <p className="mt-2 font-ui text-sm text-muted">
          Track every university&apos;s progress and every staff member&apos;s updates over time.
        </p>
      </Reveal>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* university-wise history */}
        <Reveal delay={0.05} className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="border-b border-line px-6 py-4">
              <h2 className="font-ui text-sm font-semibold text-ink">University-wise history</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-left font-ui text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-6 py-3">University</th>
                    <th className="px-4 py-3 text-right">Staff</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3 text-right">Published</th>
                    <th className="px-4 py-3 text-right">Overdue</th>
                    <th className="px-6 py-3">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {universities.map((u) => (
                    <tr key={u.university_id} className="transition-colors hover:bg-canvas">
                      <td className="px-6 py-3 font-medium">
                        <Link href={`/admin/history/u/${u.code}`} className="text-ink hover:text-accent">
                          {u.university}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{u.staff_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{u.total}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted">{u.published}</td>
                      <td className={`px-4 py-3 text-right tabular-nums ${u.overdue ? "font-semibold text-danger" : "text-muted"}`}>
                        {u.overdue}
                      </td>
                      <td className="px-6 py-3 text-muted">{fmtIST(u.last_task_update)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>

        {/* recent activity feed */}
        <Reveal delay={0.1}>
          <div className="card p-5">
            <h2 className="mb-4 font-ui text-sm font-semibold text-ink">Recent activity</h2>
            <ActivityFeed items={activity} showUni />
          </div>
        </Reveal>
      </div>
    </div>
  );
}

export function ActivityFeed({
  items,
  showUni,
}: {
  items: Activity[];
  showUni?: boolean;
}) {
  if (items.length === 0)
    return (
      <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
        No activity recorded yet. Updates appear here as staff act on tasks.
      </p>
    );
  return (
    <ol className="relative space-y-4 before:absolute before:left-[5px] before:top-1 before:h-full before:w-px before:bg-line">
      {items.map((a) => (
        <li key={a.id} className="relative pl-6">
          <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full border-2 border-accent bg-surface" />
          <p className="font-ui text-sm font-medium text-ink">{a.actor_name}</p>
          <p className="text-xs text-muted">
            {describeChange(a.changes).join(" · ") || a.channel || "Updated task"}
            {showUni && a.university_name ? ` — ${a.university_name}` : ""}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">{fmtIST(a.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}
