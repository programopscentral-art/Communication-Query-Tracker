import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { StatusBadge, PriorityBadge } from "@/components/Badges";
import { fmtIST } from "@/lib/format";

const PER = 25;
const STATUSES = ["pending", "in_progress", "published", "blocked", "restricted"];
const PRIORITIES = ["critical", "high", "normal"];

type SP = { uni?: string; status?: string; priority?: string; q?: string; page?: string };

export default async function AdminTasks({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: unis } = await supabase
    .from("universities")
    .select("id, name, code")
    .order("name");
  const uniByCode = new Map((unis ?? []).map((u) => [u.code, u.id as string]));

  const page = Math.max(1, Number(sp.page ?? "1"));
  const from = (page - 1) * PER;

  let query = supabase
    .from("tasks")
    .select("id, university_id, priority, channel, content_type, team, update_type, publish_at, execution_status, message_content, universities(name, code)", { count: "exact" })
    .order("publish_at", { ascending: false, nullsFirst: false })
    .range(from, from + PER - 1);

  if (sp.uni && uniByCode.has(sp.uni)) query = query.eq("university_id", uniByCode.get(sp.uni));
  if (sp.status) query = query.eq("execution_status", sp.status);
  if (sp.priority) query = query.eq("priority", sp.priority);
  if (sp.q) query = query.ilike("message_content", `%${sp.q}%`);

  const { data: tasks, count } = await query;
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER));

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams();
    const merged = { ...sp, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/admin/tasks?${p.toString()}`;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Tasks</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
            All communications
          </h1>
          <span className="font-ui text-sm text-muted">{total.toLocaleString("en-IN")} results</span>
        </div>
      </Reveal>

      {/* filter bar (GET form → server-side filtering, works without JS) */}
      <Reveal delay={0.05} className="mt-6">
        <form className="card flex flex-wrap items-end gap-3 p-4" action="/admin/tasks" method="get">
          <Field label="University">
            <select name="uni" defaultValue={sp.uni ?? ""} className="filter-input">
              <option value="">All</option>
              {(unis ?? []).map((u) => (
                <option key={u.code} value={u.code}>{u.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue={sp.status ?? ""} className="filter-input">
              <option value="">All</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Priority">
            <select name="priority" defaultValue={sp.priority ?? ""} className="filter-input">
              <option value="">All</option>
              {PRIORITIES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Search content">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="keyword…" className="filter-input w-52" />
          </Field>
          <button className="rounded-full bg-ink px-5 py-2 font-ui text-sm font-semibold text-white transition-colors hover:bg-accent">
            Apply
          </button>
          <Link href="/admin/tasks" className="font-ui text-sm text-muted hover:text-ink">Reset</Link>
        </form>
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-canvas text-left font-ui text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-6 py-3">University</th>
                  <th className="px-4 py-3">Channel / Type</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Publish At (IST)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {(tasks ?? []).map((t) => {
                  const u = t.universities as unknown as { name: string; code: string } | null;
                  return (
                    <tr key={t.id} className="transition-colors hover:bg-canvas">
                      <td className="px-6 py-3 font-medium text-ink">{u?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted">
                        {[t.channel, t.content_type].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                      <td className="px-4 py-3 text-muted">{fmtIST(t.publish_at)}</td>
                      <td className="px-4 py-3"><StatusBadge status={t.execution_status} /></td>
                      <td className="px-6 py-3 text-right">
                        {u && (
                          <Link href={`/u/${u.code}/task/${t.id}`} className="font-ui text-xs font-semibold text-accent hover:underline">
                            Open →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(tasks ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-muted">No tasks match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {/* pagination */}
          <div className="flex items-center justify-between border-t border-line px-6 py-3">
            <span className="font-ui text-xs text-muted">Page {page} of {pages}</span>
            <div className="flex gap-2">
              <PageLink disabled={page <= 1} href={qs({ page: String(page - 1) })}>← Prev</PageLink>
              <PageLink disabled={page >= pages} href={qs({ page: String(page + 1) })}>Next →</PageLink>
            </div>
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-ui text-[10px] uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}

function PageLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled)
    return <span className="rounded-full border border-line px-3 py-1.5 font-ui text-xs text-line">{children}</span>;
  return (
    <Link href={href} className="rounded-full border border-line px-3 py-1.5 font-ui text-xs font-semibold text-ink hover:border-accent hover:text-accent">
      {children}
    </Link>
  );
}
