import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Reveal } from "@/components/ui/Reveal";
import { StaffTabs } from "@/components/StaffTabs";
import { GrantAdminForm, RevokeAdminButton } from "./AccessForms";

type AdminUser = { id: string; email: string | null; full_name: string | null; role: string };
type StaffOpt = { email: string | null; name: string; employee_id: string };

export default async function AdminAccess() {
  const me = await requireAdmin();
  // Console-access staff can view this page; only full admins can change it.
  const canManage = isFullAdmin(me);
  const supabase = await createClient();

  const [{ data: admins }, { data: allowlist }, { data: staff }] = await Promise.all([
    supabase.from("app_users").select("id, email, full_name, role").eq("role", "admin"),
    supabase.from("admin_emails").select("email"),
    supabase.from("boas").select("email, name, employee_id").not("email", "is", null).order("name"),
  ]);

  const adminUsers = (admins ?? []) as AdminUser[];
  const adminEmails = new Set(adminUsers.map((a) => a.email?.toLowerCase()));
  // allow-listed but not yet signed in
  const pending = (allowlist ?? [])
    .map((r) => r.email.toLowerCase())
    .filter((e) => !adminEmails.has(e));
  const staffOpts = (staff ?? []) as StaffOpt[];
  // details lookup by email
  const byEmail = new Map(staffOpts.map((s) => [s.email?.toLowerCase(), s]));

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Staff · Privileges</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Admin access</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          Grant full admin (all universities, all controls) to a NxtWave email. They can then manage
          everything end to end.
        </p>
      </Reveal>

      <div className="mt-6"><StaffTabs active="access" /></div>

      {/* grant */}
      <Reveal delay={0.05}>
        {canManage ? (
          <GrantAdminForm staff={staffOpts} />
        ) : (
          <div className="card border-dashed p-6">
            <p className="font-ui text-sm font-semibold text-ink">View only</p>
            <p className="mt-1 font-ui text-sm text-muted">
              Your account has admin-console access, which lets you view this list. Only full admins can
              grant or remove admin access — ask {adminUsers[0]?.full_name ?? "an admin"} if someone needs it.
            </p>
          </div>
        )}
      </Reveal>

      {/* current admins */}
      <Reveal delay={0.1} className="mt-6">
        <div className="card overflow-hidden">
          <div className="border-b border-line px-6 py-4">
            <h2 className="font-ui text-sm font-semibold text-ink">Current admins ({adminUsers.length})</h2>
          </div>
          <ul className="divide-y divide-line-soft">
            {adminUsers.map((a) => {
              const det = byEmail.get(a.email?.toLowerCase());
              const isMe = a.email?.toLowerCase() === me.email.toLowerCase();
              return (
                <li key={a.id} className="flex items-center justify-between px-6 py-3">
                  <div className="min-w-0">
                    <p className="font-ui text-sm font-medium text-ink">
                      {a.full_name ?? det?.name ?? a.email}
                      {isMe && <span className="ml-2 text-xs text-accent">(you)</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {a.email}
                      {det ? ` · ${det.employee_id}` : ""}
                    </p>
                  </div>
                  {canManage && !isMe && a.email && <RevokeAdminButton email={a.email} />}
                </li>
              );
            })}
          </ul>
        </div>
      </Reveal>

      {/* pending (allow-listed, not signed in yet) */}
      {pending.length > 0 && (
        <Reveal delay={0.14} className="mt-6">
          <div className="card p-5">
            <p className="mb-2 font-ui text-sm font-semibold text-ink">Invited (not signed in yet)</p>
            <ul className="space-y-2">
              {pending.map((e) => (
                <li key={e} className="flex items-center justify-between">
                  <span className="font-ui text-sm text-muted">{e}</span>
                  {canManage && <RevokeAdminButton email={e} label="Remove" subtle />}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      )}
    </div>
  );
}
