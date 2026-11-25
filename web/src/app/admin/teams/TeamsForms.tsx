"use client";

import { useActionState, useEffect, useRef, useState, startTransition, type FormEvent } from "react";
import {
  saveTeamsSettings,
  saveTeamsWebhook,
  removeTeamsWebhook,
  setTeamsUniversity,
  sendTeamsTestCard,
  type TeamsFormState,
} from "@/app/teams-actions";

/** Submit without React's automatic form reset, so typed values survive an error. */
const keepValues = (action: (fd: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  startTransition(() => action(fd));
};

function Msg({ state }: { state: TeamsFormState }) {
  if (!state.message) return null;
  const bad = state.tone === "error";
  return (
    <div
      role={bad ? "alert" : "status"}
      className={`rounded-xl border px-4 py-2.5 font-ui text-sm ${bad ? "border-danger/40 bg-red-50 text-danger" : "border-green-200 bg-green-50 text-success"}`}
    >
      <p className="font-semibold">{state.message}</p>
      {state.detail && <p className={`mt-1 whitespace-pre-line text-xs ${bad ? "text-danger/90" : "text-ink/80"}`}>{state.detail}</p>}
    </div>
  );
}

const label = "mb-1 block font-ui text-[10px] uppercase tracking-wider text-muted";

export function TeamsSettingsForm({ settings }: { settings: { enabled: boolean; quietStart: string; quietEnd: string; maxLateMin: number } }) {
  const [state, action, pending] = useActionState<TeamsFormState, FormData>(saveTeamsSettings, {});
  const [enabled, setEnabled] = useState(settings.enabled);
  return (
    <form onSubmit={keepValues(action)} className="space-y-5">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
        <span>
          <span className="block font-ui text-sm font-semibold text-ink">Send Teams reminders</span>
          <span className="block font-ui text-xs text-muted">
            Master switch. Off = nothing is sent. Only universities switched on below get cards. WhatsApp must be off.
          </span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={label}>Quiet hours from (IST)</span>
          <input type="time" name="quiet_start" defaultValue={settings.quietStart} className="filter-input w-full" />
        </label>
        <label className="block">
          <span className={label}>Until (IST)</span>
          <input type="time" name="quiet_end" defaultValue={settings.quietEnd} className="filter-input w-full" />
        </label>
        <label className="block">
          <span className={label}>Skip if late by more than</span>
          <div className="flex items-center gap-2">
            <input type="number" name="max_late" min={1} max={60} defaultValue={settings.maxLateMin} className="filter-input w-20" />
            <span className="font-ui text-xs text-muted">min</span>
          </div>
        </label>
      </div>
      {enabled && !settings.enabled && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 font-ui text-xs text-amber-900">
          <b>Before switching on:</b> send a test card to each university you turned on, and one that tags someone who is <i>not</i> in the team.
        </p>
      )}
      <Msg state={state} />
      <button disabled={pending} className="rounded-full bg-ink px-5 py-2 font-ui text-sm font-semibold text-white hover:bg-accent disabled:opacity-60">
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function UniversityToggle({ universityId, enabled, canEnable }: { universityId: string; enabled: boolean; canEnable: boolean }) {
  const [state, action, pending] = useActionState<TeamsFormState, FormData>(setTeamsUniversity, {});
  return (
    <form onSubmit={keepValues(action)} className="space-y-2">
      <input type="hidden" name="university_id" value={universityId} />
      <input type="hidden" name="enabled" value={enabled ? "off" : "on"} />
      <button
        disabled={pending || (!enabled && !canEnable)}
        title={!enabled && !canEnable ? "Save a webhook first" : undefined}
        className={`rounded-full px-3 py-1 font-ui text-xs font-semibold disabled:opacity-50 ${
          enabled ? "bg-green-100 text-success hover:bg-green-200" : "bg-line-soft text-muted hover:bg-line"
        }`}
      >
        {pending ? "…" : enabled ? "On — turn off" : "Off — turn on"}
      </button>
      {state.tone === "error" && <Msg state={state} />}
    </form>
  );
}

export function WebhookForm({ universityId, channelName, hasWebhook }: { universityId: string; channelName: string | null; hasWebhook: boolean }) {
  const [state, action, pending] = useActionState<TeamsFormState, FormData>(saveTeamsWebhook, {});
  const urlRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Never keep the secret in the page after it's saved.
    if (state.tone === "success" && urlRef.current) urlRef.current.value = "";
  }, [state]);
  return (
    <form onSubmit={keepValues(action)} className="space-y-3">
      <input type="hidden" name="university_id" value={universityId} />
      <label className="block">
        <span className={label}>{hasWebhook ? "Replace webhook URL" : "Webhook URL"} · from the Teams workflow</span>
        <input
          ref={urlRef}
          name="url"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://…/workflows/…"
          className="filter-input w-full font-mono"
        />
      </label>
      <label className="block">
        <span className={label}>Channel name (label only)</span>
        <input name="channel_name" defaultValue={channelName ?? ""} placeholder="PingBoard CDU" className="filter-input w-full" />
      </label>
      <Msg state={state} />
      <button disabled={pending} className="rounded-full bg-ink px-4 py-1.5 font-ui text-xs font-semibold text-white hover:bg-accent disabled:opacity-60">
        {pending ? "Saving…" : "Save webhook"}
      </button>
    </form>
  );
}

export function RemoveWebhookButton({ universityId }: { universityId: string }) {
  const [state, action, pending] = useActionState<TeamsFormState, FormData>(removeTeamsWebhook, {});
  return (
    <form
      onSubmit={(e) => {
        if (!confirm("Remove this webhook? Teams reminders for this university will stop.")) {
          e.preventDefault();
          return;
        }
        keepValues(action)(e);
      }}
      className="space-y-2"
    >
      <input type="hidden" name="university_id" value={universityId} />
      <button disabled={pending} className="font-ui text-xs font-semibold text-danger hover:underline disabled:opacity-60">
        {pending ? "Removing…" : "Remove webhook"}
      </button>
      <Msg state={state} />
    </form>
  );
}

export function TestCardForm({ universityId }: { universityId: string }) {
  const [state, action, pending] = useActionState<TeamsFormState, FormData>(sendTeamsTestCard, {});
  return (
    <form onSubmit={keepValues(action)} className="space-y-3">
      <input type="hidden" name="university_id" value={universityId} />
      <label className="block">
        <span className={label}>Also tag (optional) · an @nxtwave.co.in email</span>
        <input name="tag_email" type="email" placeholder="name@nxtwave.co.in" className="filter-input w-full" />
      </label>
      <Msg state={state} />
      <button disabled={pending} className="rounded-full bg-accent px-4 py-1.5 font-ui text-xs font-semibold text-white disabled:opacity-60">
        {pending ? "Sending…" : "Send test card"}
      </button>
      <p className="font-ui text-[11px] text-muted">Works even while Teams reminders are off. Posts a real card to this university&apos;s channel.</p>
    </form>
  );
}
