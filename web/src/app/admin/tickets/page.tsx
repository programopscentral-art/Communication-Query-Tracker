import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateTicketStatus, assignTicket } from "@/app/actions";
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
  assigned_to: string | null;
  assigned_to_name: string | null;
  universities: { name: string } | null;
};
type Person = { id: string; full_name: string | null; email: string | null };

const STATUSES = ["open", "in_progress", "resolved", "closed"];
const STATUS_TONE: Record<string, string> = {
  open: "bg-amber-100 text-warn",
  in_progress: "bg-blue-100 text-info",
  resolved: "bg-green-100 text-success",
  closed: "bg-line-soft text-muted",
};

export default async function AdminTickets({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const view: ViewKey = isViewKey(sp.view) ? sp.view : "all";
  const supabase = await createClient();

  const { gte, lt } = istWindow(view);
  let q = supabase
    .from("tickets")
    .select("id, subject, description, status, priority, tags, link, created_at, raised_by_name, assigned_to, assigned_to_name, universities(name)")
    .order("created_at", { ascending: false })
    .limit(200);
  if (gte) q = q.gte("created_at", gte);
  if (lt) q = q.lt("created_at", lt);
  const { data } = await q;
  const tickets = (data ?? []) as unknown as Ticket[];

  // people the admin can tag a ticket to
  const { data: peopleData } = await supabase.from("app_users").select("id, full_name, email").order("full_name");
  const people = (peopleData ?? []) as Person[];

  const openCount = tickets.filter((t) => t.status === "open").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Support</p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Tickets</h1>
          <span className="font-ui text-sm text-muted">{openCount} open</span>
        </div>
      </Reveal>

      <Reveal delay={0.05} className="mt-6">
        <ViewTabs current={view} />
      </Reveal>

      <div className="mt-4 space-y-3">
        {tickets.map((t) => (
          <div key={t.id} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[t.status] ?? ""}`}>{t.status}</span>
                  <span className="font-ui text-xs text-muted">{t.universities?.name ?? "—"}</span>
                  {t.priority && t.priority !== "normal" && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-danger capitalize">{t.priority}</span>
                  )}
                </div>
                <p className="mt-2 font-ui text-sm font-semibold text-ink">{t.subject}</p>
                {t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {t.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-accent-soft px-2 py-0.5 font-ui text-xs text-accent">#{tag}</span>
                  ))}
                  {t.link && (
                    <a href={t.link} target="_blank" rel="noopener noreferrer" className="font-ui text-xs font-semibold text-info hover:underline">Open link ↗</a>
                  )}
                </div>
                <p className="mt-2 font-ui text-xs text-muted">
                  Raised by <span className="text-ink">{t.raised_by_name ?? "—"}</span> · {fmtIST(t.created_at)}
                  {t.assigned_to_name && <> · Tagged to <span className="text-ink">{t.assigned_to_name}</span></>}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2">
                <form action={updateTicketStatus}>
                  <input type="hidden" name="ticket_id" value={t.id} />
                  <select name="status" defaultValue={t.status} className="filter-input w-full">
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button className="mt-1 block w-full rounded-full bg-ink px-3 py-1.5 font-ui text-xs font-semibold text-white hover:bg-accent">
                    Update
                  </button>
                </form>
                <form action={assignTicket}>
                  <input type="hidden" name="ticket_id" value={t.id} />
                  <select name="assigned_to" defaultValue={t.assigned_to ?? ""} className="filter-input w-full">
                    <option value="">Tag to… (optional)</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.full_name ?? p.email}</option>
                    ))}
                  </select>
                  <button className="mt-1 block w-full rounded-full border border-line px-3 py-1.5 font-ui text-xs font-semibold text-muted hover:border-accent hover:text-accent">
                    Tag
                  </button>
                </form>
              </div>
            </div>
          </div>
        ))}
        {tickets.length === 0 && (
          <p className="card px-5 py-12 text-center text-sm text-muted">No tickets in this window.</p>
        )}
      </div>
    </div>
  );
}
