import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { updateStaff, upsertAssignment, removeAssignment, setAdminAccess } from "@/app/actions";
import { Reveal } from "@/components/ui/Reveal";
import { waLink } from "@/lib/format";

const TEAM_SCOPES = [
  { value: "", label: "All teams" },
  { value: "Student Engagement", label: "Student Engagement" },
  { value: "Parent Communication", label: "Parent Communication" },
];

export default async function EditStaff({ params }: { params: Promise<{ boaId: string }> }) {
  await requireAdmin();
  const { boaId } = await params;
  const supabase = await createClient();

  const { data: boa } = await supabase
    .from("boas")
    .select("id, name, employee_id, designation, whatsapp_e164, email, active")
    .eq("id", boaId)
    .maybeSingle();
  if (!boa) notFound();

  const [{ data: assigns }, { data: unis }, { data: appUser }] = await Promise.all([
    supabase.from("university_boas").select("role, team_scope, receive_reminders, universities(id, name, code)").eq("boa_id", boaId),
    supabase.from("universities").select("id, name").order("name"),
    supabase.from("app_users").select("id, can_view_admin").eq("boa_id", boaId).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href="/admin/staff" className="font-ui text-sm text-accent hover:underline">← Staff directory</Link>
        <div className="mt-3 flex items-center gap-3">
          <p className="eyebrow">Edit staff</p>
          <a href={waLink(boa.whatsapp_e164)} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line px-2.5 py-1 font-ui text-xs font-semibold text-success hover:border-success">WhatsApp ↗</a>
        </div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">{boa.name}</h1>
      </Reveal>

      {/* details */}
      <Reveal delay={0.05} className="mt-6">
        <form action={updateStaff} className="card space-y-4 p-6">
          <input type="hidden" name="boa_id" value={boa.id} />
          <p className="font-ui text-sm font-semibold text-ink">Details <span className="text-muted">· {boa.employee_id}</span></p>
          <div className="grid grid-cols-2 gap-4">
            <L label="Full name"><input name="name" defaultValue={boa.name} className="filter-input w-full" /></L>
            <L label="Designation"><input name="designation" defaultValue={boa.designation ?? ""} className="filter-input w-full" /></L>
            <L label="WhatsApp"><input name="whatsapp_e164" defaultValue={boa.whatsapp_e164} className="filter-input w-full" /></L>
            <L label="Email"><input name="email" defaultValue={boa.email ?? ""} className="filter-input w-full" /></L>
          </div>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="active" defaultChecked={boa.active} className="h-4 w-4 accent-[var(--color-accent)]" />
            <span className="font-ui text-sm text-ink">Active (receives reminders)</span>
          </label>
          <button className="rounded-full bg-ink px-5 py-2 font-ui text-sm font-semibold text-white transition-colors hover:bg-accent">Save details</button>
        </form>
      </Reveal>

      {/* assignments */}
      <Reveal delay={0.1} className="mt-6">
        <div className="card p-6">
          <p className="mb-3 font-ui text-sm font-semibold text-ink">University assignments</p>
          <div className="space-y-2">
            {(assigns ?? []).map((a, i) => {
              const u = a.universities as unknown as { id: string; name: string; code: string } | null;
              return (
                <form key={i} action={removeAssignment} className="flex items-center justify-between rounded-lg border border-line px-4 py-2.5">
                  <div>
                    <span className="font-ui text-sm font-medium text-ink">{u?.name}</span>
                    <span className="ml-2 text-xs capitalize text-muted">{a.role}{a.team_scope ? ` · ${a.team_scope}` : ""}{a.receive_reminders ? "" : " · muted"}</span>
                  </div>
                  <input type="hidden" name="boa_id" value={boa.id} />
                  <input type="hidden" name="university_id" value={u?.id ?? ""} />
                  <input type="hidden" name="team_scope" value={a.team_scope} />
                  <button className="font-ui text-xs font-semibold text-danger hover:underline">Remove</button>
                </form>
              );
            })}
            {(assigns ?? []).length === 0 && <p className="text-sm text-muted">No assignments yet.</p>}
          </div>

          {/* add assignment */}
          <form action={upsertAssignment} className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-line bg-canvas p-4">
            <input type="hidden" name="boa_id" value={boa.id} />
            <L label="Add to university">
              <select name="university_id" required className="filter-input w-full">
                <option value="">— select —</option>
                {(unis ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </L>
            <L label="Role">
              <select name="role" className="filter-input w-full"><option value="primary">Primary</option><option value="backup">Backup</option></select>
            </L>
            <L label="Team scope">
              <select name="team_scope" className="filter-input w-full">{TEAM_SCOPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
            </L>
            <label className="flex items-center gap-2 self-end pb-2">
              <input type="checkbox" name="receive_reminders" defaultChecked className="h-4 w-4 accent-[var(--color-accent)]" />
              <span className="font-ui text-sm text-ink">Receive reminders</span>
            </label>
            <button className="col-span-2 rounded-full bg-accent px-5 py-2 font-ui text-sm font-semibold text-white transition-all hover:-translate-y-0.5">Add / update assignment</button>
          </form>
        </div>
      </Reveal>

      {/* admin-console access grant */}
      <Reveal delay={0.14} className="mt-6">
        <div className="card p-6">
          <p className="mb-1 font-ui text-sm font-semibold text-ink">Admin console access</p>
          <p className="mb-4 font-ui text-sm text-muted">
            Let this person open the Admin console and use the “← Admin” navigation. Off by default —
            they otherwise see only their own university.
          </p>
          {appUser ? (
            <form action={setAdminAccess} className="flex items-center gap-3">
              <input type="hidden" name="boa_id" value={boa.id} />
              <input type="hidden" name="can_view_admin" value={(!appUser.can_view_admin).toString()} />
              <span
                className={`rounded-full px-3 py-1 font-ui text-xs font-semibold ${
                  appUser.can_view_admin ? "bg-green-100 text-success" : "bg-line-soft text-muted"
                }`}
              >
                {appUser.can_view_admin ? "Access granted" : "No access"}
              </span>
              <button
                className={`rounded-full border px-4 py-2 font-ui text-sm font-semibold transition-all hover:-translate-y-0.5 ${
                  appUser.can_view_admin
                    ? "border-line text-danger hover:border-danger"
                    : "border-accent bg-accent-soft text-accent"
                }`}
              >
                {appUser.can_view_admin ? "Revoke access" : "Grant access"}
              </button>
            </form>
          ) : (
            <p className="rounded-lg border border-dashed border-line px-3 py-3 text-sm text-muted">
              This person must sign in once (so their account exists) before access can be granted.
            </p>
          )}
        </div>
      </Reveal>
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block font-ui text-[10px] uppercase tracking-wider text-muted">{label}</span>{children}</label>;
}
