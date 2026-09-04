"use client";

import { useState, useTransition } from "react";
import { setStaffActive, deleteStaff } from "@/app/actions";

/**
 * Inline, instant staff actions for the directory table:
 *   • Activate / Deactivate (soft — preserves history, stops reminders)
 *   • Delete permanently (guarded confirm; warns if a login is linked)
 * Both call server actions that revalidate /admin/staff, so the row updates
 * without a page navigation.
 */
export function StaffRowActions({
  boaId,
  name,
  active,
  hasAccount,
}: {
  boaId: string;
  name: string;
  active: boolean;
  hasAccount: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function toggleActive() {
    start(async () => {
      const fd = new FormData();
      fd.set("boa_id", boaId);
      fd.set("active", (!active).toString());
      await setStaffActive(fd);
    });
  }

  function doDelete() {
    start(async () => {
      const fd = new FormData();
      fd.set("boa_id", boaId);
      await deleteStaff(fd);
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <span className="font-ui text-xs text-danger">
          Delete {name} permanently?
        </span>
        {hasAccount && (
          <span className="max-w-[15rem] text-right font-ui text-[11px] leading-snug text-muted">
            This person has a login — deleting unlinks their account (they’ll show “no university” until re-added).
          </span>
        )}
        <span className="max-w-[15rem] text-right font-ui text-[11px] leading-snug text-muted">
          Removes their assignments and reminder history too. Tip: “Deactivate” keeps history.
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={doDelete}
            disabled={pending}
            className="rounded-full bg-danger px-3 py-1.5 font-ui text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Deleting…" : "Yes, delete"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="rounded-full border border-line px-3 py-1.5 font-ui text-xs text-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button
        onClick={toggleActive}
        disabled={pending}
        className="rounded-full border border-line px-3 py-1.5 font-ui text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
        title={active ? "Stop reminders for this BOA" : "Reactivate this BOA"}
      >
        {pending ? "…" : active ? "Deactivate" : "Activate"}
      </button>
      <button
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="rounded-full border border-line px-3 py-1.5 font-ui text-xs font-semibold text-danger transition-colors hover:border-danger disabled:opacity-60"
      >
        Delete
      </button>
    </div>
  );
}
