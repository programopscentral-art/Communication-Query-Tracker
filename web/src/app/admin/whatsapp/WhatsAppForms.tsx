"use client";

import { useActionState, useState, startTransition, type FormEvent } from "react";
import { saveWhatsAppSettings, sendWhatsAppTest, type WaFormState } from "@/app/whatsapp-actions";

/** Submit without React's automatic form reset, so typed values survive an error. */
const keepValues = (action: (fd: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  startTransition(() => action(fd));
};

function Msg({ state }: { state: WaFormState }) {
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

export function WhatsAppSettingsForm({
  settings,
}: {
  settings: { enabled: boolean; testMode: boolean; testNumbers: string[]; quietStart: string; quietEnd: string; maxLateMin: number };
}) {
  const [state, action, pending] = useActionState<WaFormState, FormData>(saveWhatsAppSettings, {});
  const [enabled, setEnabled] = useState(settings.enabled);
  const [testMode, setTestMode] = useState(settings.testMode);
  return (
    <form onSubmit={keepValues(action)} className="space-y-5">
      <label className="flex items-start gap-3">
        <input type="checkbox" name="enabled" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
        <span>
          <span className="block font-ui text-sm font-semibold text-ink">Send WhatsApp messages</span>
          <span className="block font-ui text-xs text-muted">Master switch. Off = nothing is sent; reminders that fall due meanwhile are skipped, never sent late.</span>
        </span>
      </label>

      <label className="flex items-start gap-3">
        <input type="checkbox" name="test_mode" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]" />
        <span>
          <span className="block font-ui text-sm font-semibold text-ink">Test mode — only send to the numbers below</span>
          <span className="block font-ui text-xs text-muted">Untick to go live for <b className="text-ink">all staff</b>. Reminders for anyone else are skipped while this is on.</span>
        </span>
      </label>

      <label className="block">
        <span className={label}>Test numbers · one per line</span>
        <textarea
          name="test_numbers"
          rows={3}
          defaultValue={settings.testNumbers.join("\n")}
          placeholder={"9876543210\n+91 98765 43211"}
          className="filter-input w-full font-mono"
        />
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

      {enabled && !testMode && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 font-ui text-xs text-amber-900">
          <b>Live mode:</b> every active staff member with reminders on will get messages. Make sure the test messages arrived correctly first.
        </p>
      )}
      <Msg state={state} />
      <button disabled={pending} className="rounded-full bg-ink px-5 py-2 font-ui text-sm font-semibold text-white hover:bg-accent disabled:opacity-60">
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

export function WhatsAppTestForm() {
  const [state, action, pending] = useActionState<WaFormState, FormData>(sendWhatsAppTest, {});
  return (
    <form onSubmit={keepValues(action)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Send to</span>
          <input name="to" inputMode="tel" placeholder="Your WhatsApp number" className="filter-input w-full" />
        </label>
        <label className="block">
          <span className={label}>Message</span>
          <select name="kind" className="filter-input w-full">
            <option value="reminder">Publish reminder</option>
            <option value="event">Event report reminder</option>
          </select>
        </label>
      </div>
      <Msg state={state} />
      <button disabled={pending} className="rounded-full bg-accent px-5 py-2 font-ui text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Sending…" : "Send test message"}
      </button>
      <p className="font-ui text-xs text-muted">Uses sample data and works even while sending is switched off. Each test is a real (paid) WhatsApp message.</p>
    </form>
  );
}

export function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border border-line bg-canvas p-3 pr-16 font-mono text-xs text-ink">{text}</pre>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
        className="absolute right-2 top-2 rounded-full border border-line bg-surface px-2.5 py-1 font-ui text-[11px] font-semibold text-ink hover:border-accent hover:text-accent"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
