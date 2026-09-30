"use client";

import { useActionState, useEffect, useState, startTransition, type FormEvent } from "react";
import {
  createEvents,
  updateEventDetails,
  saveEventReport,
  deleteEvent,
  mapCampusName,
  syncEventsNow,
  saveNudgeSettings,
  runNudgesNow,
  bulkSetZoho,
  type EventFormState,
  type EventSyncState,
} from "@/app/events-actions";
import { DETAIL_FIELDS, TRACKING_FIELDS, REPORT_FIELDS, type FieldDef } from "@/lib/events";
import { UniversityMultiSelect } from "@/components/UniversityMultiSelect";

type Opt = { value: string; label: string };
type Vals = Record<string, string | null | undefined>;

/** Submit without React's automatic form reset, so what was typed is never lost
 *  (e.g. a long report that fails validation). */
const keepValues = (action: (fd: FormData) => void) => (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  startTransition(() => action(fd));
};

function Msg({ state }: { state: EventFormState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-4 py-2.5 font-ui text-sm ${
        state.tone === "error" ? "border-danger/40 bg-red-50 text-danger" : "border-green-200 bg-green-50 text-success"
      }`}
    >
      {state.message}
    </p>
  );
}

function Label({ f, children }: { f: { label: string; hint?: string }; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-ui text-[10px] uppercase tracking-wider text-muted">
        {f.label}
        {f.hint && <span className="ml-1 normal-case tracking-normal text-muted/80">· {f.hint}</span>}
      </span>
      {children}
    </label>
  );
}

function FieldInput({ f, value, options, disabled }: { f: FieldDef; value?: string | null; options?: string[]; disabled?: boolean }) {
  if (f.kind === "textarea") {
    return <textarea name={f.key} defaultValue={value ?? ""} rows={3} disabled={disabled} className="filter-input w-full" />;
  }
  const listId = f.kind === "choice" && options?.length ? `opts-${f.key}` : undefined;
  return (
    <>
      <input
        name={f.key}
        defaultValue={value ?? ""}
        list={listId}
        disabled={disabled}
        placeholder={f.kind === "link" ? "https://… or NA" : f.hint ?? ""}
        className="filter-input w-full"
      />
      {listId && (
        <datalist id={listId}>
          {options!.map((o) => <option key={o} value={o} />)}
        </datalist>
      )}
    </>
  );
}

/** Event details — create (multi-university) or edit (single). Full admins only. */
export function EventDetailsForm({
  mode,
  event,
  universities,
  options,
}: {
  mode: "create" | "edit";
  event?: Vals & { id: string };
  universities: Opt[];
  options: Record<string, string[]>;
}) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(
    mode === "create" ? createEvents : updateEventDetails,
    {},
  );
  return (
    <form onSubmit={keepValues(action)} className="card space-y-5 p-6 sm:p-8">
      {event && <input type="hidden" name="id" value={event.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label f={{ label: "Event title *" }}>
            <input name="title" required defaultValue={event?.title ?? ""} className="filter-input w-full" />
          </Label>
        </div>
        <div className="sm:col-span-2">
          {mode === "create" ? (
            <Label f={{ label: "University / campus * (one event is created per university)" }}>
              <UniversityMultiSelect options={universities} />
            </Label>
          ) : (
            <Label f={{ label: "University / campus" }}>
              <select name="university_id" defaultValue={event?.university_id ?? ""} className="filter-input w-full">
                <option value="">— not linked —</option>
                {universities.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </Label>
          )}
        </div>
        <Label f={{ label: mode === "create" ? "Event date *" : "Event date" }}>
          <input type="date" name="event_date" required={mode === "create"} defaultValue={event?.event_date ?? ""} className="filter-input w-full" />
        </Label>
        <Label f={{ label: "End date", hint: "multi-day events" }}>
          <input type="date" name="event_end_date" defaultValue={event?.event_end_date ?? ""} className="filter-input w-full" />
        </Label>
        {DETAIL_FIELDS.map((f) => (
          <Label key={f.key} f={f}>
            <FieldInput f={f} value={event?.[f.key]} options={options[f.key]} />
          </Label>
        ))}
      </div>
      <div className="grid gap-4 rounded-xl border border-dashed border-line bg-canvas p-4 sm:grid-cols-2">
        {TRACKING_FIELDS.map((f) => (
          <div key={f.key} className={f.kind === "textarea" ? "sm:col-span-2" : ""}>
            <Label f={f}>
              <FieldInput f={f} value={event?.[f.key]} options={options[f.key]} />
            </Label>
          </div>
        ))}
      </div>
      <Msg state={state} />
      <button
        disabled={pending}
        className="rounded-full bg-accent px-6 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
      >
        {pending ? "Saving…" : mode === "create" ? "Create event" : "Save details"}
      </button>
      {mode === "create" && (
        <p className="font-ui text-xs text-muted">
          The report fields (description, participants, feedback, photos…) are filled by the university&apos;s staff.
        </p>
      )}
    </form>
  );
}

/** The event report — the university's staff (or a full admin). */
export function EventReportForm({ event, canEdit }: { event: Vals & { id: string }; canEdit: boolean }) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(saveEventReport, {});
  return (
    <form onSubmit={keepValues(action)} className="card space-y-5 p-6 sm:p-8">
      <input type="hidden" name="id" value={event.id} />
      <fieldset disabled={!canEdit} className="grid gap-4 sm:grid-cols-2">
        {REPORT_FIELDS.map((f) => (
          <div key={f.key} className={f.kind === "textarea" ? "sm:col-span-2" : ""}>
            <Label f={f}>
              <FieldInput f={f} value={event[f.key]} />
            </Label>
          </div>
        ))}
      </fieldset>
      <Msg state={state} />
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            disabled={pending}
            className="rounded-full bg-accent px-6 py-2.5 font-ui text-sm font-semibold text-white shadow-[var(--shadow-glow)] transition-all hover:-translate-y-0.5 disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save report"}
          </button>
          <span className="font-ui text-xs text-muted">
            Write <b className="text-ink">NA</b> for anything that doesn&apos;t apply. Save anytime — you can come back and finish it.
          </span>
        </div>
      )}
    </form>
  );
}

export function EventSyncButton() {
  const [state, action, pending] = useActionState<EventSyncState, FormData>(syncEventsNow, {});
  return (
    <form action={action}>
      <button
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 font-ui text-sm font-semibold text-white transition-colors hover:bg-accent disabled:opacity-60"
      >
        <span className={pending ? "animate-spin" : ""}>↻</span>
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {state.message && <p className="mt-2 max-w-md font-ui text-xs text-success">{state.message}</p>}
      {state.error && <p className="mt-2 max-w-md font-ui text-xs text-danger">{state.error}</p>}
    </form>
  );
}

export function CampusMapRow({ raw, current, universities, count }: { raw: string; current: string | null; universities: Opt[]; count: number }) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(mapCampusName, {});
  return (
    <form onSubmit={keepValues(action)} className="flex flex-wrap items-center gap-2 py-2">
      <input type="hidden" name="raw" value={raw} />
      <span className="w-full truncate font-ui text-sm text-ink sm:w-40" title={raw}>
        {raw} <span className="text-xs text-muted">({count})</span>
      </span>
      <span className="hidden text-muted sm:inline">→</span>
      <select name="university_id" defaultValue={current ?? ""} className="filter-input min-w-0 flex-1 sm:min-w-[12rem]">
        <option value="">— not mapped —</option>
        {universities.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
      </select>
      <button disabled={pending} className="rounded-full border border-line px-3 py-1.5 font-ui text-xs font-semibold text-muted hover:border-accent hover:text-accent disabled:opacity-60">
        {pending ? "…" : "Save"}
      </button>
      {state.message && <span className={`w-full font-ui text-xs ${state.tone === "error" ? "text-danger" : "text-success"}`}>{state.message}</span>}
    </form>
  );
}

/** Reminder settings for pending event reports (full admins). */
export function ReminderSettingsForm({
  settings,
}: {
  settings: { enabled: boolean; after: number; escalate: number; lookback: number };
}) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(saveNudgeSettings, {});
  const num = (name: string, value: number, label: string, hint: string) => (
    <label className="block">
      <span className="mb-1 block font-ui text-[10px] uppercase tracking-wider text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input name={name} type="number" min={0} defaultValue={value} className="filter-input w-20" />
        <span className="font-ui text-xs text-muted">{hint}</span>
      </div>
    </label>
  );
  return (
    <form onSubmit={keepValues(action)} className="space-y-4">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="enabled" defaultChecked={settings.enabled} className="h-4 w-4 accent-[var(--color-accent)]" />
        <span className="font-ui text-sm font-semibold text-ink">Remind staff about pending reports</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        {num("after", settings.after, "Remind after", "days after the event")}
        {num("escalate", settings.escalate, "Escalate after", "days after the event")}
        {num("lookback", settings.lookback, "Only chase events from the last", "days")}
      </div>
      <Msg state={state} />
      <button disabled={pending} className="rounded-full bg-ink px-5 py-2 font-ui text-sm font-semibold text-white hover:bg-accent disabled:opacity-60">
        {pending ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}

/** Preview (dry run) or queue reminders now (full admins). */
export function RunNudgesButtons() {
  const [state, action, pending] = useActionState<EventFormState, FormData>(runNudgesNow, {});
  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const fd = new FormData(e.currentTarget);
    fd.set("mode", submitter?.value ?? "preview");
    startTransition(() => action(fd));
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button value="preview" disabled={pending} className="rounded-full border border-line px-4 py-2 font-ui text-sm font-semibold text-ink hover:border-accent hover:text-accent disabled:opacity-60">
          Preview
        </button>
        <button value="run" disabled={pending} className="rounded-full bg-accent px-4 py-2 font-ui text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Working…" : "Queue reminders now"}
        </button>
      </div>
      <Msg state={state} />
    </form>
  );
}

/** Toolbar for bulk "Loaded to Zoho"; row checkboxes join it via form="bulk-zoho". */
export function BulkZohoBar() {
  const [state, action, pending] = useActionState<EventFormState, FormData>(bulkSetZoho, {});
  const [count, setCount] = useState(0);
  const boxes = () => [...document.querySelectorAll<HTMLInputElement>('input[form="bulk-zoho"][name="ids"]')];
  const refresh = () => setCount(boxes().filter((b) => b.checked).length);
  const toggleAll = (on: boolean) => { boxes().forEach((b) => (b.checked = on)); refresh(); };

  // Row checkboxes sit in the table (outside this form in the DOM), so listen on the document.
  useEffect(() => {
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement | null;
      if (t?.getAttribute("form") === "bulk-zoho") refresh();
    };
    document.addEventListener("change", onChange);
    return () => document.removeEventListener("change", onChange);
  }, []);
  // After a successful update, clear the ticks.
  useEffect(() => {
    if (state.tone === "success") toggleAll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.at]);

  return (
    <form
      id="bulk-zoho"
      onSubmit={keepValues(action)}
      className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-6 py-3"
    >
      <button type="button" onClick={() => toggleAll(count === 0)} className="rounded-full border border-line px-3 py-1.5 font-ui text-xs font-semibold text-muted hover:border-accent hover:text-accent">
        {count === 0 ? "Select all" : "Clear selection"}
      </button>
      <span className="font-ui text-xs text-muted">{count} selected →</span>
      <select name="zoho_value" defaultValue="Yes" aria-label="Loaded to Zoho" className="filter-input">
        <option value="Yes">Loaded to Zoho: Yes</option>
        <option value="No">Loaded to Zoho: No</option>
        <option value="NA">Loaded to Zoho: NA</option>
        <option value="clear">Clear Zoho status</option>
      </select>
      <button disabled={pending || count === 0} className="rounded-full bg-ink px-4 py-1.5 font-ui text-xs font-semibold text-white hover:bg-accent disabled:opacity-50">
        {pending ? "Applying…" : "Apply"}
      </button>
      {state.message && (
        <span className={`font-ui text-xs ${state.tone === "error" ? "text-danger" : "text-success"}`}>{state.message}</span>
      )}
    </form>
  );
}

export function DeleteEventButton({ id, fromSheet }: { id: string; fromSheet: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<EventFormState, FormData>(deleteEvent, {});
  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="rounded-full border border-line px-4 py-2 font-ui text-sm font-semibold text-danger hover:border-danger">
        Delete
      </button>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      <span className="max-w-xs text-right font-ui text-xs text-muted">
        Delete this event and its report permanently?
        {fromSheet && " It's still in the Google Sheet, so the next sync will bring it back — remove it from the sheet too."}
      </span>
      <div className="flex gap-2">
        <button disabled={pending} className="rounded-full bg-danger px-4 py-1.5 font-ui text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Deleting…" : "Yes, delete"}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-full border border-line px-4 py-1.5 font-ui text-sm text-muted">
          Cancel
        </button>
      </div>
      {state.message && <span className="font-ui text-xs text-danger">{state.message}</span>}
    </form>
  );
}
