import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { StaffTabs } from "@/components/StaffTabs";
import { ReadOnlyNotice } from "@/components/ReadOnlyNotice";
import { GrantAdminForm, RevokeAdminButton } from "./AccessForms";

type Account = { id: string; email: string | null; full_name: string | null; role: string; can_view_admin: boolean };
type StaffOpt = { email: string | null; name: string; employee_id: string };
type Invite = { email: string; level: "admin" | "viewer" };

export default async function AdminAccess() {
  const me = await requireAdmin();
  // Read-only admins can view this page; only full admins can change it.
  const canManage = isFullAdmin(me);
  const supabase = await createClient();

  const [{ data: accounts }, { data: allowlist }, { data: staff }] = await Promise.all([
    supabase.from("app_users").select("id, email, full_name, role, can_view_admin"),
    supabase.from("admin_emails").select("email, level"),
    supabase.from("boas").select("email, name, employee_id").not("email", "is", null).order("name"),
  ]);

  const all = (accounts ?? []) as Account[];
  const fullAdmins = all.filter((a) => a.role === "admin");
  const viewers = all.filter((a) => a.role !== "admin" && a.can_view_admin);
  const signedIn = new Set(all.map((a) => a.email?.toLowerCase()));
  // on the allowlist but never signed in (no account yet)
  const pending = ((allowlist ?? []) as Invite[]).filter((r) => !signedIn.has(r.email.toLowerCase()));
  const staffOpts = (staff ?? []) as StaffOpt[];
  const byEmail = new Map(staffOpts.map((s) => [s.email?.toLowerCase(), s]));

  const Row = ({ a }: { a: Account }) => {
    const det = byEmail.get(a.email?.toLowerCase());
    const isMe = a.email?.toLowerCase() === me.email.toLowerCase();
    return (
      <li className="flex items-center justify-between px-6 py-3">
        <div className="min-w-0">
          <p className="font-ui text-sm font-medium text-ink">
            {a.full_name ?? det?.name ?? a.email}
            {isMe && <span className="ml-2 text-xs text-accent">(you)</span>}
          </p>
          <p className="break-all text-xs text-muted">
            {a.email}
            {det ? ` · ${det.employee_id}` : ""}
          </p>
        </div>
        {canManage && !isMe && a.email && <RevokeAdminButton email={a.email} />}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Staff · Privileges</p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Admin access</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          <b className="text-ink">Full admin</b> — sees and manages everything.{" "}
          <b className="text-ink">Read-only admin</b> — sees everything a full admin sees (all universities,
          all tabs), but can&apos;t create, update, or delete anything.
        </p>
      </Reveal>

      <div className="mt-6"><StaffTabs active="access" /></div>

      {/* grant */}
      <Reveal delay={0.05}>
        {canManage ? <GrantAdminForm staff={staffOpts} /> : <ReadOnlyNotice what="grant or remove admin access" />}
      </Reveal>

      <Reveal delay={0.1} className="mt-6">
        <div className="card overflow-hidden">
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-ui text-sm font-semibold text-ink">Full admins ({fullAdmins.length})</h2>
          </div>
          <ul className="divide-y divide-line-soft">
            {fullAdmins.map((a) => <Row key={a.id} a={a} />)}
          </ul>
        </div>
      </Reveal>

      <Reveal delay={0.12} className="mt-6">
        <div className="card overflow-hidden">
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-ui text-sm font-semibold text-ink">Read-only admins ({viewers.length})</h2>
          </div>
          <ul className="divide-y divide-line-soft">
            {viewers.map((a) => <Row key={a.id} a={a} />)}
            {viewers.length === 0 && <li className="px-6 py-4 text-sm text-muted">No read-only admins yet.</li>}
          </ul>
        </div>
      </Reveal>

      {pending.length > 0 && (
        <Reveal delay={0.14} className="mt-6">
          <div className="card p-5">
            <p className="font-ui text-sm font-semibold text-ink">Invited — access granted, waiting for first sign-in</p>
            <p className="mb-3 mt-0.5 font-ui text-xs text-muted">
              Their access is ready. It switches on the first time they sign in to PingBoard with Google.
            </p>
            <ul className="space-y-2">
              {pending.map((r) => (
                <li key={r.email} className="flex items-center justify-between gap-3">
                  <span className="font-ui text-sm text-muted">
                    {r.email}
                    <span className="ml-2 rounded-full bg-line-soft px-2 py-0.5 text-xs text-ink">
                      {r.level === "viewer" ? "Read-only" : "Full admin"}
                    </span>
                  </span>
                  {canManage && <RevokeAdminButton email={r.email} label="Remove" subtle />}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      )}
    </div>
  );
}
