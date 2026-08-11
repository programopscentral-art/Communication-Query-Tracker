"use client";

import { useActionState } from "react";
import { createStaff, type StaffFormState } from "@/app/actions";

const TEAM_SCOPES = [
  { value: "", label: "All teams" },
  { value: "Student Engagement", label: "Student Engagement" },
  { value: "Parent Communication", label: "Parent Communication" },
];

export function NewStaffForm({ unis }: { unis: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<StaffFormState, FormData>(createStaff, {});

  return (
    <form action={action} className="card space-y-4 p-6">
      {state.error && (
        <div className="rounded-xl border border-danger/40 bg-red-50 px-4 py-3 font-ui text-sm text-danger">
          {state.error}
        </div>
      )}

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
              {unis.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
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

      <button
        disabled={pending}
        className="rounded-full bg-accent px-5 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
      >
        {pending ? "Creating…" : "Create staff"}
      </button>
      <p className="text-xs text-muted">WhatsApp must be a valid <b className="text-ink">+91…</b> number (no spaces/dashes) and unique to this person.</p>
    </form>
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
