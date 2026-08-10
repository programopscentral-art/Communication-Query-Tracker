"use client";

import { useState } from "react";
import { saveReminderPrefs } from "@/app/actions";

const PRESETS = [5, 10, 15, 30, 60, 120];

/** Small-click control: pick how many minutes before publish to send the
 *  WhatsApp reminder, and whether it fires automatically (cron) or only on
 *  a manual "Send now". Editable by admin + that university's staff. */
export function ReminderPrefs({
  universityId,
  code,
  offsets,
  auto,
}: {
  universityId: string;
  code: string;
  offsets: number[];
  auto: boolean;
}) {
  const [selected, setSelected] = useState<number[]>(offsets);
  const [autoOn, setAutoOn] = useState(auto);
  const [saved, setSaved] = useState(false);

  const toggle = (n: number) =>
    setSelected((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n].sort((a, b) => b - a)));

  return (
    <form
      action={async (fd) => {
        fd.set("university_id", universityId);
        fd.set("code", code);
        selected.forEach((n) => fd.append("offset", String(n)));
        if (autoOn) fd.set("auto_enabled", "on");
        await saveReminderPrefs(fd);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }}
      className="card p-5"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Reminder timing</p>
          <p className="font-ui text-sm font-semibold text-ink">
            Send WhatsApp reminders before publish
          </p>
        </div>
        {/* auto / manual toggle */}
        <button
          type="button"
          onClick={() => setAutoOn((v) => !v)}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-ui text-xs font-semibold transition-colors ${
            autoOn ? "border-accent bg-accent-soft text-accent" : "border-line text-muted"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${autoOn ? "bg-accent pulse-ring" : "bg-muted"}`} />
          {autoOn ? "Auto (cron)" : "Manual only"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESETS.map((n) => {
          const on = selected.includes(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => toggle(n)}
              className={`rounded-full border px-3.5 py-1.5 font-ui text-sm font-medium transition-all ${
                on
                  ? "border-accent bg-accent text-white shadow-[var(--shadow-glow)]"
                  : "border-line text-muted hover:border-accent hover:text-accent"
              }`}
            >
              {n} min
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button className="rounded-full bg-ink px-5 py-2 font-ui text-sm font-semibold text-white transition-colors hover:bg-accent">
          Save timing
        </button>
        {saved && <span className="font-ui text-sm text-success">Saved ✓</span>}
        <span className="font-ui text-xs text-muted">
          {selected.length ? `Reminds at ${selected.join(", ")} min before` : "No reminders set"}
          {autoOn ? " · automatically" : " · manual send only"}
        </span>
      </div>
    </form>
  );
}
