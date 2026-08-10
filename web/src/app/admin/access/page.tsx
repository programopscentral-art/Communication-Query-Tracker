import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { grantAdmin, revokeAdmin } from "@/app/actions";
import { Reveal } from "@/components/ui/Reveal";
import { StaffTabs } from "@/components/StaffTabs";

type AdminUser = { id: string; email: string | null; full_name: string | null; role: string };
type StaffOpt = { email: string | null; name: string; employee_id: string };

export default async function AdminAccess() {
  const me = await requireAdmin();
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
        <form action={grantAdmin} className="card p-6">
          <p className="mb-3 font-ui text-sm font-semibold text-ink">Grant admin access</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              name="email"
              type="email"
              required
              list="staff-emails"
              placeholder="name@nxtwave.co.in"
              className="filter-input w-full sm:flex-1"
            />
            <datalist id="staff-emails">
              {staffOpts.map((s) => (
                <option key={s.employee_id} value={s.email ?? ""}>
                  {s.name} · {s.employee_id}
                </option>
              ))}
            </datalist>
            <button className="rounded-full bg-accent px-5 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5">
              Grant admin
            </button>
          </div>
          <p className="mt-2 font-ui text-xs text-muted">
            Pick an existing staff email or type any @nxtwave.co.in address. Access applies on their next sign-in.
          </p>
        </form>
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
                  {!isMe && (
                    <form action={revokeAdmin}>
                      <input type="hidden" name="email" value={a.email ?? ""} />
                      <button className="rounded-full border border-line px-3 py-1.5 font-ui text-xs font-semibold text-danger transition-colors hover:border-danger">
                        Revoke
                      </button>
                    </form>
                  )}
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
                  <form action={revokeAdmin}>
                    <input type="hidden" name="email" value={e} />
                    <button className="font-ui text-xs font-semibold text-danger hover:underline">Remove</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
      )}
    </div>
  );
}
