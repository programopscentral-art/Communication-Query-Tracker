"use client";

import { useActionState } from "react";
import { syncSheetNow, type SyncState } from "@/app/actions";

/** One-click pull of the Google Sheet. Only rendered when Sheet mode is active. */
export function SyncNowButton() {
  const [state, action, pending] = useActionState<SyncState, FormData>(syncSheetNow, {});
  return (
    <form action={action} className="mt-4">
      <button
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-ui text-sm font-semibold text-white transition-colors hover:bg-accent disabled:opacity-60"
      >
        <span className={pending ? "animate-spin" : ""}>↻</span>
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {state.message && <p className="mt-2 font-ui text-sm text-success">{state.message}</p>}
      {state.error && <p className="mt-2 font-ui text-sm text-danger">{state.error}</p>}
      <p className="mt-2 font-ui text-xs text-muted">
        Pulls the tracker sheet immediately. Only new rows are added — duplicates are skipped and Sheet wins.
      </p>
    </form>
  );
}
