import { requireUniversityAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createTicket } from "@/app/actions";
import { fmtIST } from "@/lib/format";
import { istWindow, isViewKey, type ViewKey } from "@/lib/time";
import { Reveal } from "@/components/ui/Reveal";
import { ViewTabs } from "@/components/ViewTabs";

type Ticket = {
  id: string;
  subject: string;
  description: string | null;
  status: string;
  priority: string | null;
  tags: string[];
  link: string | null;
  created_at: string;
  raised_by_name: string | null;
  assigned_to_name: string | null;
};

const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-100 text-warn",
  in_progress: "bg-blue-100 text-info",
  resolved: "bg-green-100 text-success",
  closed: "bg-line-soft text-muted",
};

export default async function Tickets({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { code } = await params;
  const { view: rawView } = await searchParams;
  await requireUniversityAccess(code);
  const view: ViewKey = isViewKey(rawView) ? rawView : "all";
  const supabase = await createClient();

  const { gte, lt } = istWindow(view);
  let q = supabase
    .from("tickets")
    .select("id, subject, description, status, priority, tags, link, created_at, raised_by_name, assigned_to_name")
    .order("created_at", { ascending: false })
    .limit(200);
  if (gte) q = q.gte("created_at", gte);
  if (lt) q = q.lt("created_at", lt);
  const { data } = await q;
  const tickets = (data ?? []) as Ticket[];

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Support</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Tickets</h1>
        <p className="mt-2 font-ui text-sm text-muted">Raise an issue or request — the admin team will pick it up.</p>
      </Reveal>

      <Reveal delay={0.06} className="mt-6">
        <form action={createTicket} className="card space-y-3 p-6">
          <input type="hidden" name="code" value={code} />
          <input name="subject" required placeholder="Subject *" className="filter-input w-full" />
          <textarea name="description" rows={3} placeholder="Describe the issue…" className="filter-input w-full" />
          <div className="grid grid-cols-2 gap-3">
            <select name="priority" className="filter-input w-full" defaultValue="normal">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <input name="tags" placeholder="Tags (comma separated)" className="filter-input w-full" />
          </div>
          <input name="link" type="url" placeholder="Optional link (e.g. Google Sheet)" className="filter-input w-full" />
          <button className="rounded-full bg-accent px-5 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5">
            Raise ticket
          </button>
        </form>
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        <ViewTabs current={view} />
      </Reveal>

      <div className="mt-4 space-y-3">
        {tickets.map((t) => (
          <div key={t.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-ui text-sm font-semibold text-ink">{t.subject}</p>
                {t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[t.status] ?? ""}`}>
                {t.status}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {t.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-accent-soft px-2 py-0.5 font-ui text-xs text-accent">#{tag}</span>
              ))}
              {t.link && (
                <a href={t.link} target="_blank" rel="noopener noreferrer" className="font-ui text-xs font-semibold text-info hover:underline">
                  Open link ↗
                </a>
              )}
              {t.assigned_to_name && (
                <span className="rounded-full bg-line-soft px-2 py-0.5 font-ui text-xs text-muted">Tagged: {t.assigned_to_name}</span>
              )}
            </div>
            <p className="mt-2 font-ui text-xs text-muted">
              Raised by <span className="text-ink">{t.raised_by_name ?? "—"}</span> · {fmtIST(t.created_at)}
            </p>
          </div>
        ))}
        {tickets.length === 0 && (
          <p className="card px-5 py-10 text-center text-sm text-muted">No tickets in this window.</p>
        )}
      </div>
    </div>
  );
}
