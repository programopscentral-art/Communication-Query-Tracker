import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { istWindow, isViewKey, type ViewKey } from "@/lib/time";
import { StatusBadge, PriorityBadge } from "@/components/Badges";
import { Reveal } from "@/components/ui/Reveal";
import { ViewTabs } from "@/components/ViewTabs";
import { UniSelect } from "@/components/UniSelect";
import { ViewInSheet } from "@/components/ViewInSheet";

export default async function AdminSchedule({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; uni?: string }>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const view: ViewKey = isViewKey(sp.view) ? sp.view : "today";
  const supabase = await createClient();

  const { data: unis } = await supabase.from("universities").select("id, name, code").order("name");
  const uniByCode = new Map((unis ?? []).map((u) => [u.code, u.id as string]));

  const { gte, lt } = istWindow(view);
  let q = supabase
    .from("tasks")
    .select("id, priority, channel, content_type, team, publish_at, execution_status, source_gid, source_row, universities(name, code)", { count: "exact" })
    .order("publish_at", { ascending: view !== "yesterday", nullsFirst: false });
  if (gte) q = q.gte("publish_at", gte);
  if (lt) q = q.lt("publish_at", lt);
  if (view === "overdue") q = q.in("execution_status", ["pending", "in_progress"]);
  if (sp.uni && uniByCode.has(sp.uni)) q = q.eq("university_id", uniByCode.get(sp.uni));
  const { data, count } = await q.limit(300);
  const tasks = data ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Schedule</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
            Publish timeline
          </h1>
          <span className="font-ui text-sm text-muted">
            {(count ?? tasks.length).toLocaleString("en-IN")} in window
          </span>
        </div>
      </Reveal>

      <Reveal delay={0.06} className="mt-6 flex flex-wrap items-center gap-3">
        <ViewTabs current={view} />
        <UniSelect options={unis ?? []} current={sp.uni ?? ""} />
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        {tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-12 text-center text-sm text-muted">
            No tasks scheduled in this window.
          </p>
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => {
              const u = t.universities as unknown as { name: string; code: string } | null;
              return (
                <div key={t.id} className="group flex items-center gap-2 rounded-xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-[var(--shadow-card)]">
                    <Link
                      href={u ? `/u/${u.code}/task/${t.id}` : "#"}
                      className="flex min-w-0 flex-1 items-center justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <PriorityBadge priority={t.priority} />
                        <div className="min-w-0">
                          <p className="truncate font-ui text-sm font-semibold text-ink">
                            {u?.name ?? "—"}
                          </p>
                          <p className="truncate text-xs text-muted">
                            {[t.channel, t.content_type, t.team].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                      <div className="ml-3 shrink-0 text-right">
                        <StatusBadge status={t.execution_status} />
                        <p className="mt-1 font-ui text-xs text-muted">{fmtIST(t.publish_at)}</p>
                      </div>
                    </Link>
                    <ViewInSheet compact gid={t.source_gid as string | null} row={t.source_row as number | null} />
                  </div>
              );
            })}
          </div>
        )}
      </Reveal>
    </div>
  );
}
