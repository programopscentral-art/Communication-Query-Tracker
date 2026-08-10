"use client";

import { useState, useTransition } from "react";
import { sendReminderNow } from "@/app/actions";

/** Manual trigger: queue an immediate WhatsApp reminder to the university's BOAs. */
export function SendNowButton({ taskId, code }: { taskId: string; code: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [tone, setTone] = useState<"ok" | "warn">("ok");

  function send() {
    start(async () => {
      try {
        const n = await sendReminderNow(taskId, code);
        if (n > 0) {
          setTone("ok");
          setMsg(`Queued to ${n} BOA${n > 1 ? "s" : ""} — sending shortly.`);
        } else {
          setTone("warn");
          setMsg("No BOAs assigned to this university yet.");
        }
      } catch (e) {
        setTone("warn");
        setMsg(e instanceof Error ? e.message : "Failed to queue.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={send}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full border border-accent bg-accent-soft px-4 py-2 font-ui text-sm font-semibold text-accent transition-all hover:-translate-y-0.5 disabled:opacity-60"
      >
        <span className="text-base leading-none">⚡</span>
        {pending ? "Queuing…" : "Send reminder now"}
      </button>
      {msg && (
        <span className={`font-ui text-sm ${tone === "ok" ? "text-success" : "text-warn"}`}>{msg}</span>
      )}
    </div>
  );
}
