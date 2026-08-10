import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createStaff } from "@/app/actions";
import { Reveal } from "@/components/ui/Reveal";

const TEAM_SCOPES = [
  { value: "", label: "All teams" },
  { value: "Student Engagement", label: "Student Engagement" },
  { value: "Parent Communication", label: "Parent Communication" },
];

export default async function NewStaff() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: unis } = await supabase.from("universities").select("id, name").order("name");

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <Reveal>
        <Link href="/admin/staff" className="font-ui text-sm text-accent hover:underline">← Staff directory</Link>
        <p className="eyebrow mb-2 mt-3">New staff</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Add a BOA / staff member</h1>
      </Reveal>

      <Reveal delay={0.06} className="mt-6">
        <form action={createStaff} className="card space-y-4 p-6">
          <div className="grid grid-cols-2 gap-4">
            <Labeled label="Employee ID *"><input name="employee_id" required className="filter-input w-full" placeholder="NW10234" /></Labeled>
            <Labeled label="Full name *"><input name="name" required className="filter-input w-full" placeholder="Ravi Kumar" /></Labeled>
          </div>
          <Labeled label="Designation"><input name="designation" className="filter-input w-full" placeholder="BOA – Student Engagement" /></Labeled>
          <div className="grid grid-cols-2 gap-4">
            <Labeled label="WhatsApp (+91…) *"><input name="whatsapp_e164" required className="filter-input w-full" placeholder="+919876543210" /></Labeled>
            <Labeled label="Login email"><input name="email" type="email" className="filter-input w-full" placeholder="ravi.k@nxtwave.co.in" /></Labeled>
          </div>

          <div className="rounded-xl border border-line bg-canvas p-4">
            <p className="eyebrow mb-3">Assignment</p>
            <div className="grid grid-cols-2 gap-4">
              <Labeled label="University">
                <select name="university_id" className="filter-input w-full">
                  <option value="">— none —</option>
                  {(unis ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </Labeled>
              <Labeled label="Role">
                <select name="role" className="filter-input w-full">
                  <option value="primary">Primary</option>
                  <option value="backup">Backup</option>
                </select>
              </Labeled>
              <Labeled label="Team scope">
                <select name="team_scope" className="filter-input w-full">
                  {TEAM_SCOPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Labeled>
              <label className="flex items-center gap-2 self-end pb-2">
                <input type="checkbox" name="receive_reminders" defaultChecked className="h-4 w-4 accent-[var(--color-accent)]" />
                <span className="font-ui text-sm text-ink">Receive reminders</span>
              </label>
            </div>
          </div>

          <button className="rounded-full bg-accent px-5 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5">
            Create staff
          </button>
          <p className="text-xs text-muted">WhatsApp must be a valid <b className="text-ink">+91…</b> number (no spaces/dashes).</p>
        </form>
      </Reveal>
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-ui text-[10px] uppercase tracking-wider text-muted">{label}</span>
      {children}
    </label>
  );
}
