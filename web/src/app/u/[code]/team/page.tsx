import { notFound } from "next/navigation";
import { requireUniversityAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { waLink, telLink } from "@/lib/format";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";

type Member = {
  role: string;
  team_scope: string;
  receive_reminders: boolean;
  boas: {
    id: string;
    name: string;
    employee_id: string;
    designation: string | null;
    whatsapp_e164: string;
    email: string | null;
    active: boolean;
  } | null;
};

export default async function Team({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  await requireUniversityAccess(code);
  const supabase = await createClient();

  const { data: uni } = await supabase.from("universities").select("id, name").eq("code", code).single();
  if (!uni) notFound();

  // RLS scopes this to the current user's own university only.
  const { data } = await supabase
    .from("university_boas")
    .select("role, team_scope, receive_reminders, boas(id, name, employee_id, designation, whatsapp_e164, email, active)")
    .eq("university_id", uni.id);

  const members = (data ?? []) as unknown as Member[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Your university</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">{uni.name} — Team</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          {members.length} staff. You only ever see your own university&apos;s people.
        </p>
      </Reveal>

      <RevealGroup className="mt-8 grid gap-3 sm:grid-cols-2">
        {members.map((m, i) => {
          const b = m.boas;
          if (!b) return null;
          return (
            <RevealItem key={b.id + i}>
              <div className="card flex h-full flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-ui text-sm font-semibold text-ink">{b.name}</p>
                    <p className="text-xs text-muted">
                      {b.employee_id}
                      {b.designation ? ` · ${b.designation}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-line-soft px-2 py-0.5 font-ui text-[10px] font-semibold uppercase tracking-wider text-muted">
                    {m.role}
                    {m.team_scope ? ` · ${m.team_scope}` : ""}
                  </span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <a
                    href={waLink(b.whatsapp_e164)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-line px-3 py-1.5 font-ui text-xs font-semibold text-success transition-colors hover:border-success"
                  >
                    WhatsApp
                  </a>
                  <a href={telLink(b.whatsapp_e164)} className="font-ui text-xs text-muted hover:text-ink">
                    {b.whatsapp_e164}
                  </a>
                  {!b.active && <span className="ml-auto text-xs text-danger">Inactive</span>}
                </div>
                {b.email && <p className="mt-2 truncate font-ui text-xs text-muted">{b.email}</p>}
              </div>
            </RevealItem>
          );
        })}
        {members.length === 0 && (
          <p className="card px-5 py-10 text-center text-sm text-muted">No staff listed for your university yet.</p>
        )}
      </RevealGroup>
    </div>
  );
}
