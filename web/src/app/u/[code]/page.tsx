import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUniversityAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { istWindow, isViewKey, type ViewKey } from "@/lib/time";
import { StatusBadge, PriorityBadge } from "@/components/Badges";
import { Reveal } from "@/components/ui/Reveal";
import { ViewTabs } from "@/components/ViewTabs";
import { ReminderPrefs } from "@/components/ReminderPrefs";
import { ViewInSheet } from "@/components/ViewInSheet";
import { loadOverdue } from "@/lib/eventQueries";

type Task = {
  id: string;
  team: string | null;
  update_type: string | null;
  category: string | null;
  priority: string | null;
  channel: string | null;
  content_type: string | null;
  publish_at: string | null;
  execution_status: string;
  source_gid: string | null;
  source_row: number | null;
};

export default async function UniversityBoard({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { code } = await params;
  const { view: rawView } = await searchParams;
  const { canEdit } = await requireUniversityAccess(code);
  const view: ViewKey = isViewKey(rawView) ? rawView : "today";
  const supabase = await createClient();

  const { data: uni } = await supabase
    .from("universities")
    .select("id, name, code")
    .eq("code", code)
    .single();
  if (!uni) notFound();

  const { gte, lt } = istWindow(view);
  let q = supabase
    .from("tasks")
    .select("id, team, update_type, category, priority, channel, content_type, publish_at, execution_status, source_gid, source_row")
    .eq("university_id", uni.id)
    .order("publish_at", { ascending: view !== "yesterday", nullsFirst: false });
  if (gte) q = q.gte("publish_at", gte);
  if (lt) q = q.lt("publish_at", lt);
  if (view === "overdue") q = q.in("execution_status", ["pending", "in_progress"]);

  // prefs + tasks in parallel (both only need uni.id) — one round-trip, not two
  const [{ data: prefs }, { data }, overdueRows] = await Promise.all([
    supabase.from("reminder_prefs").select("offsets_min, auto_enabled").eq("university_id", uni.id).maybeSingle(),
    q.limit(500),
    loadOverdue(supabase, uni.id),
  ]);
  const tasks = (data ?? []) as Task[];
  const overdueReports = overdueRows.reduce((n, r) => n + r.overdue, 0);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Your board</p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">{uni.name}</h1>
      </Reveal>

      {overdueReports > 0 && (
        <Reveal delay={0.03} className="mt-6">
          <Link
            href={`/u/${code}/events?month=all&status=overdue`}
            className="card flex flex-wrap items-center justify-between gap-3 border-red-200 bg-red-50 px-5 py-4 transition-all hover:-translate-y-0.5"
          >
            <span className="font-ui text-sm text-red-900">
              📋 <b>{overdueReports} event report{overdueReports === 1 ? " is" : "s are"} overdue</b>
              {canEdit ? " — please fill them." : "."}
            </span>
            <span className="font-ui text-sm font-semibold text-red-900">Open event reports →</span>
          </Link>
        </Reveal>
      )}

      <Reveal delay={0.05} className="mt-6">
        {canEdit ? (
          <ReminderPrefs
            universityId={uni.id}
            code={code}
            offsets={prefs?.offsets_min ?? [15, 10]}
            auto={prefs?.auto_enabled ?? true}
          />
        ) : (
          <div className="card px-5 py-4 font-ui text-sm text-muted">
            <span className="font-semibold text-ink">Reminder timing:</span>{" "}
            {(prefs?.offsets_min ?? [15, 10]).join(" & ")} min before publish ·{" "}
            {(prefs?.auto_enabled ?? true) ? "automatic" : "manual only"}
            <span className="ml-2 rounded-full bg-line-soft px-2 py-0.5 text-xs">view only</span>
          </div>
        )}
      </Reveal>

      <Reveal delay={0.1} className="mt-8">
        <ViewTabs current={view} />
      </Reveal>

      <div className="mt-6">
        {tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
            No tasks in this window — you&apos;re all caught up.
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <div key={t.id} className="group flex items-center gap-2 rounded-xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-card)]">
                  <Link href={`/u/${code}/task/${t.id}`} className="flex min-w-0 flex-1 items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <PriorityBadge priority={t.priority} />
                        <span className="truncate font-ui text-sm font-semibold text-ink">
                          {[t.channel, t.content_type].filter(Boolean).join(" · ") || "Task"}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted">
                        {[t.team, t.update_type, t.category].filter(Boolean).join(" / ")}
                      </p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <StatusBadge status={t.execution_status} />
                      <p className="mt-1 font-ui text-xs text-muted">{fmtIST(t.publish_at)}</p>
                    </div>
                  </Link>
                  <ViewInSheet compact gid={t.source_gid} row={t.source_row} />
                </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
