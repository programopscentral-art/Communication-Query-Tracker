import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import type { Changes } from "@/lib/activity";
import { Reveal, RevealGroup } from "@/components/ui/Reveal";
import { StatCard } from "@/components/ui/StatCard";
import { ActivityFeed } from "@/app/admin/history/page";

export default async function StaffHistory({ params }: { params: Promise<{ boaId: string }> }) {
  await requireAdmin();
  const { boaId } = await params;
  const supabase = await createClient();

  const { data: boa } = await supabase
    .from("boas")
    .select("id, name, employee_id, designation, whatsapp_e164, email, active")
    .eq("id", boaId)
    .maybeSingle();
  if (!boa) notFound();

  const [{ data: activity }, { data: unis }, { data: timeline }] = await Promise.all([
    supabase.from("v_staff_activity").select("*").eq("boa_id", boaId).maybeSingle(),
    supabase
      .from("university_boas")
      .select("role, team_scope, universities(name, code)")
      .eq("boa_id", boaId),
    supabase
      .from("v_recent_activity")
      .select("*")
      .eq("boa_id", boaId)
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href="/admin/history" className="font-ui text-sm text-accent hover:underline">
          ← History
        </Link>
        <p className="eyebrow mb-2 mt-3">Staff history</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">{boa.name}</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          {boa.employee_id}
          {boa.designation ? ` · ${boa.designation}` : ""} · {boa.whatsapp_e164}
          {!boa.active && <span className="ml-2 text-danger">Inactive</span>}
        </p>
      </Reveal>

      <RevealGroup className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Updates made" value={activity?.updates_made ?? 0} tone="ink" />
        <StatCard label="Reminders sent" value={activity?.reminders_sent ?? 0} tone="green" />
        <StatCard label="Reminders total" value={activity?.reminders_total ?? 0} tone="blue" />
        <StatCard label="Universities" value={(unis ?? []).length} tone="accent" />
      </RevealGroup>

      <Reveal delay={0.05} className="mt-8">
        <div className="card p-5">
          <h2 className="mb-3 font-ui text-sm font-semibold text-ink">Assigned universities</h2>
          <div className="flex flex-wrap gap-2">
            {(unis ?? []).map((u, i) => {
              const univ = u.universities as unknown as { name: string; code: string } | null;
              if (!univ) return null;
              return (
                <Link
                  key={i}
                  href={`/admin/history/u/${univ.code}`}
                  className="rounded-full border border-line px-3 py-1.5 font-ui text-xs font-medium text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  {univ.name}
                  <span className="ml-1.5 capitalize text-muted">· {u.role}</span>
                </Link>
              );
            })}
            {(unis ?? []).length === 0 && <p className="text-sm text-muted">No assignments.</p>}
          </div>
        </div>
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        <div className="card p-5">
          <h2 className="mb-4 font-ui text-sm font-semibold text-ink">Update history</h2>
          <ActivityFeed
            items={(timeline ?? []).map((a) => ({
              id: a.id as number,
              created_at: a.created_at as string,
              actor_name: a.actor_name as string,
              changes: a.changes as Changes,
              university_name: a.university_name as string | null,
              university_code: null,
              channel: a.channel as string | null,
            }))}
            showUni
          />
        </div>
      </Reveal>
    </div>
  );
}
