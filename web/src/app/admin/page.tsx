import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal, RevealGroup } from "@/components/ui/Reveal";
import { StatCard } from "@/components/ui/StatCard";

type Row = {
  university_id: string;
  university: string;
  code: string;
  pending: number;
  in_progress: number;
  published: number;
  blocked: number;
  restricted: number;
  total: number;
  overdue: number;
};

export default async function AdminHome() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from("task_status_by_university")
    .select("*")
    .order("total", { ascending: false });

  const list = (rows ?? []) as Row[];
  const t = list.reduce(
    (a, r) => ({
      pending: a.pending + r.pending,
      in_progress: a.in_progress + r.in_progress,
      published: a.published + r.published,
      blocked: a.blocked + r.blocked,
      overdue: a.overdue + r.overdue,
      total: a.total + r.total,
    }),
    { pending: 0, in_progress: 0, published: 0, blocked: 0, overdue: 0, total: 0 },
  );

  const { count: failedCount } = await supabase
    .from("reminder_jobs")
    .select("*", { count: "exact", head: true })
    .eq("status", "failed");

  const seg = [
    { label: "Published", val: t.published, color: "var(--color-success)" },
    { label: "Pending", val: t.pending, color: "var(--color-warn)" },
    { label: "In Progress", val: t.in_progress, color: "var(--color-info)" },
    { label: "Blocked", val: t.blocked, color: "var(--color-danger)" },
  ];
  const segTotal = seg.reduce((s, x) => s + x.val, 0) || 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Overview</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
            Communication Command Center
          </h1>
          <div className="flex items-center gap-4">
            <Link href="/admin/announcements" className="font-ui text-sm font-semibold text-accent hover:underline">
              Announcement bar →
            </Link>
            <p className="font-ui text-sm text-muted">{list.length} universities · live</p>
          </div>
        </div>
      </Reveal>

      {/* stat row */}
      <RevealGroup className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={t.total} tone="ink" />
        <StatCard label="Pending" value={t.pending} tone="amber" />
        <StatCard label="In Progress" value={t.in_progress} tone="blue" />
        <StatCard label="Overdue" value={t.overdue} tone="red" hint="past publish time" />
        <StatCard label="Blocked" value={t.blocked} tone="red" />
        <StatCard label="Failed pings" value={failedCount ?? 0} tone="muted" />
      </RevealGroup>

      {/* distribution bar */}
      <Reveal delay={0.1} className="mt-8">
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-ui text-sm font-semibold text-ink">Status distribution</h2>
            <span className="font-ui text-xs text-muted">{t.total.toLocaleString("en-IN")} tasks</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-line-soft">
            {seg.map((s) => (
              <div
                key={s.label}
                style={{ width: `${(s.val / segTotal) * 100}%`, background: s.color }}
                title={`${s.label}: ${s.val}`}
              />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {seg.map((s) => (
              <div key={s.label} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="font-ui text-xs text-muted">
                  {s.label} <span className="font-semibold text-ink">{s.val.toLocaleString("en-IN")}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </Reveal>

      {/* university table */}
      <Reveal delay={0.15} className="mt-8">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <h2 className="font-ui text-sm font-semibold text-ink">By university</h2>
            <Link href="/admin/tasks" className="font-ui text-xs font-semibold text-accent hover:underline">
              View all tasks →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left font-ui text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3">University</th>
                  <th className="px-4 py-3 text-right">Pending</th>
                  <th className="px-4 py-3 text-right">In Progress</th>
                  <th className="px-4 py-3 text-right">Overdue</th>
                  <th className="px-4 py-3 text-right">Blocked</th>
                  <th className="px-4 py-3 text-right">Published</th>
                  <th className="px-6 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {list.map((r) => (
                  <tr key={r.university_id} className="transition-colors hover:bg-canvas">
                    <td className="px-6 py-3 font-medium">
                      <Link href={`/u/${r.code}`} className="text-ink hover:text-accent">
                        {r.university}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.pending}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.in_progress}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${r.overdue ? "font-semibold text-danger" : "text-muted"}`}>
                      {r.overdue}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{r.blocked}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted">{r.published}</td>
                    <td className="px-6 py-3 text-right font-ui font-semibold tabular-nums">{r.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
