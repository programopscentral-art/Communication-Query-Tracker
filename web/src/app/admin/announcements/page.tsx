import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAnnouncement, setAnnouncementActive } from "@/app/actions";
import { fmtIST } from "@/lib/format";
import { Reveal } from "@/components/ui/Reveal";

type Ann = {
  id: string;
  message: string;
  kind: string;
  active: boolean;
  created_at: string;
  universities: { name: string } | null;
};

export default async function Announcements() {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: unis }, { data: rows }] = await Promise.all([
    supabase.from("universities").select("id, name").order("name"),
    supabase
      .from("announcements")
      .select("id, message, kind, active, created_at, universities(name)")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const anns = (rows ?? []) as unknown as Ann[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href="/admin" className="font-ui text-sm text-accent hover:underline">← Overview</Link>
        <p className="eyebrow mb-2 mt-3">Announcement bar</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Promotional messages</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          These flow in the animated bar shown to staff. Scope to one university, or leave blank for all.
        </p>
      </Reveal>

      <Reveal delay={0.06} className="mt-6">
        <form action={createAnnouncement} className="card space-y-3 p-6">
          <input name="message" required placeholder="Message…" className="filter-input w-full" />
          <div className="grid grid-cols-2 gap-3">
            <select name="university_id" className="filter-input w-full">
              <option value="">All universities (global)</option>
              {(unis ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select name="kind" className="filter-input w-full" defaultValue="promo">
              <option value="promo">Promo ★</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
            </select>
          </div>
          <button className="rounded-full bg-accent px-5 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5">
            Publish to bar
          </button>
        </form>
      </Reveal>

      <Reveal delay={0.1} className="mt-6 space-y-2">
        {anns.map((a) => (
          <div key={a.id} className="card flex items-center justify-between p-4">
            <div className="min-w-0">
              <p className="font-ui text-sm font-medium text-ink">{a.message}</p>
              <p className="text-xs text-muted">
                {a.universities?.name ?? "Global"} · {a.kind} · {fmtIST(a.created_at)}
              </p>
            </div>
            <form action={setAnnouncementActive}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="active" value={(!a.active).toString()} />
              <button className={`rounded-full border px-3 py-1.5 font-ui text-xs font-semibold ${a.active ? "border-line text-muted hover:border-danger hover:text-danger" : "border-accent text-accent"}`}>
                {a.active ? "Deactivate" : "Activate"}
              </button>
            </form>
          </div>
        ))}
        {anns.length === 0 && <p className="card px-5 py-10 text-center text-sm text-muted">No announcements yet.</p>}
      </Reveal>
    </div>
  );
}
