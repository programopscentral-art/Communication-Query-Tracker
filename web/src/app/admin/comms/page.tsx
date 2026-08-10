import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { postInternalMessage } from "@/app/actions";
import { fmtIST } from "@/lib/format";
import { Reveal } from "@/components/ui/Reveal";

type Msg = {
  id: string;
  body: string;
  created_at: string;
  app_users: { full_name: string | null } | null;
};

export default async function InternalComms() {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("internal_messages")
    .select("id, body, created_at, app_users(full_name)")
    .order("created_at", { ascending: false })
    .limit(100);

  const messages = (data ?? []) as unknown as Msg[];

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Admin only</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">
          Internal communication
        </h1>
        <p className="mt-2 font-ui text-sm text-muted">
          Private to admins — never visible to BOAs (enforced by row-level security).
        </p>
      </Reveal>

      <Reveal delay={0.06} className="mt-6">
        <form action={postInternalMessage} className="card p-5">
          <textarea
            name="body"
            required
            rows={3}
            placeholder="Post an internal note…"
            className="filter-input w-full"
          />
          <button className="mt-3 rounded-full bg-accent px-5 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5">
            Post
          </button>
        </form>
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        <ul className="space-y-3">
          {messages.map((m) => (
            <li key={m.id} className="card p-4">
              <p className="whitespace-pre-wrap text-sm text-ink">{m.body}</p>
              <p className="mt-2 font-ui text-xs text-muted">
                {m.app_users?.full_name ?? "Admin"} · {fmtIST(m.created_at)}
              </p>
            </li>
          ))}
          {messages.length === 0 && (
            <li className="card px-5 py-10 text-center text-sm text-muted">No messages yet.</li>
          )}
        </ul>
      </Reveal>
    </div>
  );
}
