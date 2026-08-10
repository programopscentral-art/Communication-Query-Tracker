import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import type { Changes } from "@/lib/activity";
import { Reveal, RevealGroup } from "@/components/ui/Reveal";
import { StatCard } from "@/components/ui/StatCard";
import { ActivityFeed } from "@/app/admin/history/page";

export default async function UniversityHistory({ params }: { params: Promise<{ code: string }> }) {
  await requireAdmin();
  const { code } = await params;
  const supabase = await createClient();

  const { data: uni } = await supabase
    .from("v_university_history")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (!uni) notFound();

  // assigned staff + their activity
  const { data: assigns } = await supabase
    .from("university_boas")
    .select("role, team_scope, boas(id, name, employee_id, designation, whatsapp_e164, active)")
    .eq("university_id", uni.university_id);

  const boaIds = (assigns ?? []).map((a) => (a.boas as unknown as { id: string } | null)?.id).filter(Boolean) as string[];
  const { data: acts } = boaIds.length
    ? await supabase.from("v_staff_activity").select("boa_id, updates_made, last_active, reminders_total, reminders_sent").in("boa_id", boaIds)
    : { data: [] };
  const actByBoa = new Map((acts ?? []).map((a) => [a.boa_id as string, a]));

  const { data: timeline } = await supabase
    .from("v_recent_activity")
    .select("*")
    .eq("university_code", code)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href="/admin/history" className="font-ui text-sm text-accent hover:underline">
          ← History
        </Link>
        <p className="eyebrow mb-2 mt-3">University history</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">{uni.university}</h1>
      </Reveal>

      <RevealGroup className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={uni.total} tone="ink" />
        <StatCard label="Published" value={uni.published} tone="green" />
        <StatCard label="Pending" value={uni.pending} tone="amber" />
        <StatCard label="In Progress" value={uni.in_progress} tone="blue" />
        <StatCard label="Overdue" value={uni.overdue} tone="red" />
        <StatCard label="Blocked" value={uni.blocked} tone="red" />
      </RevealGroup>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* staff */}
        <Reveal delay={0.05} className="lg:col-span-2">
          <div className="card overflow-hidden">
            <div className="border-b border-line px-6 py-4">
              <h2 className="font-ui text-sm font-semibold text-ink">Staff ({(assigns ?? []).length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-canvas text-left font-ui text-xs uppercase tracking-wider text-muted">
                  <tr>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3 text-right">Updates</th>
                    <th className="px-4 py-3 text-right">Reminders</th>
                    <th className="px-6 py-3">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {(assigns ?? []).map((a, i) => {
                    const b = a.boas as unknown as { id: string; name: string; employee_id: string; designation: string | null } | null;
                    if (!b) return null;
                    const act = actByBoa.get(b.id);
                    return (
                      <tr key={b.id + i} className="transition-colors hover:bg-canvas">
                        <td className="px-6 py-3">
                          <Link href={`/admin/history/staff/${b.id}`} className="font-medium text-ink hover:text-accent">
                            {b.name}
                          </Link>
                          <p className="text-xs text-muted">{b.employee_id}{b.designation ? ` · ${b.designation}` : ""}</p>
                        </td>
                        <td className="px-4 py-3">
                          <span className="rounded-full bg-line-soft px-2 py-0.5 font-ui text-xs capitalize text-muted">
                            {a.role}{a.team_scope ? ` · ${a.team_scope}` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{act?.updates_made ?? 0}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-muted">
                          {act?.reminders_sent ?? 0}/{act?.reminders_total ?? 0}
                        </td>
                        <td className="px-6 py-3 text-muted">{act?.last_active ? fmtIST(act.last_active) : "—"}</td>
                      </tr>
                    );
                  })}
                  {(assigns ?? []).length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-muted">No staff assigned yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>

        {/* timeline */}
        <Reveal delay={0.1}>
          <div className="card p-5">
            <h2 className="mb-4 font-ui text-sm font-semibold text-ink">Activity timeline</h2>
            <ActivityFeed
              items={(timeline ?? []).map((a) => ({
                id: a.id as number,
                created_at: a.created_at as string,
                actor_name: a.actor_name as string,
                changes: a.changes as Changes,
                university_name: null,
                university_code: null,
                channel: a.channel as string | null,
              }))}
            />
          </div>
        </Reveal>
      </div>
    </div>
  );
}
