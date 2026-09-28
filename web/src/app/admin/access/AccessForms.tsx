"use client";

import { useActionState } from "react";
import { grantAdmin, revokeAdmin, type AccessState } from "@/app/actions";

const TONE = {
  error: { box: "border-danger/40 bg-red-50", title: "text-danger", icon: "!" },
  success: { box: "border-green-200 bg-green-50", title: "text-success", icon: "✓" },
  info: { box: "border-line bg-canvas", title: "text-ink", icon: "i" },
} as const;

function Notice({ state, compact = false }: { state: AccessState; compact?: boolean }) {
  if (!state.title) return null;
  const t = TONE[state.tone ?? "info"];
  return (
    <div
      role={state.tone === "error" ? "alert" : "status"}
      className={`mt-3 flex gap-3 rounded-xl border px-4 py-3 text-left ${t.box} ${compact ? "max-w-xs" : ""}`}
    >
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border font-ui text-[11px] font-bold ${t.title} border-current`}>
        {t.icon}
      </span>
      <div>
        <p className={`font-ui text-sm font-semibold ${t.title}`}>{state.title}</p>
        {state.detail && <p className="mt-0.5 font-ui text-sm text-muted">{state.detail}</p>}
      </div>
    </div>
  );
}

export function GrantAdminForm({ staff }: { staff: { email: string | null; name: string; employee_id: string }[] }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(grantAdmin, {});
  return (
    <form action={action} className="card p-6">
      <p className="mb-3 font-ui text-sm font-semibold text-ink">Grant admin access</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          // re-mount after each result so the field shows what was typed (kept on error, cleared on success)
          key={state.at ?? 0}
          defaultValue={state.email ?? ""}
          name="email"
          type="email"
          required
          list="staff-emails"
          placeholder="name@nxtwave.co.in"
          aria-invalid={state.tone === "error" || undefined}
          className={`filter-input w-full sm:flex-1 ${state.tone === "error" ? "border-danger" : ""}`}
        />
        <datalist id="staff-emails">
          {staff.map((s) => (
            <option key={s.employee_id} value={s.email ?? ""}>
              {s.name} · {s.employee_id}
            </option>
          ))}
        </datalist>
        <button
          disabled={pending}
          className="rounded-full bg-accent px-5 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
        >
          {pending ? "Granting…" : "Grant admin"}
        </button>
      </div>
      <p className="mt-2 font-ui text-xs text-muted">
        Pick an existing staff email or type any @nxtwave.co.in address. Access applies on their next sign-in.
      </p>
      <Notice state={state} />
    </form>
  );
}

export function RevokeAdminButton({ email, label = "Revoke", subtle = false }: { email: string; label?: string; subtle?: boolean }) {
  const [state, action, pending] = useActionState<AccessState, FormData>(revokeAdmin, {});
  return (
    <form action={action} className="text-right">
      <input type="hidden" name="email" value={email} />
      <button
        disabled={pending}
        className={
          subtle
            ? "font-ui text-xs font-semibold text-danger hover:underline disabled:opacity-60"
            : "rounded-full border border-line px-3 py-1.5 font-ui text-xs font-semibold text-danger transition-colors hover:border-danger disabled:opacity-60"
        }
      >
        {pending ? "…" : label}
      </button>
      {state.tone === "error" && <Notice state={state} compact />}
    </form>
  );
}
