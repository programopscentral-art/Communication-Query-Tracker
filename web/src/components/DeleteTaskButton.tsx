"use client";

import { useState, useTransition } from "react";
import { deleteTask } from "@/app/actions";

/** Admin-only delete with a confirm step. */
export function DeleteTaskButton({ taskId, code }: { taskId: string; code: string }) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function doDelete() {
    start(async () => {
      const fd = new FormData();
      fd.set("task_id", taskId);
      fd.set("code", code);
      await deleteTask(fd); // redirects to the board on success
    });
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="rounded-full border border-line px-4 py-2 font-ui text-sm font-semibold text-danger transition-colors hover:border-danger"
      >
        Delete
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="font-ui text-sm text-muted">Delete permanently?</span>
      <button
        onClick={doDelete}
        disabled={pending}
        className="rounded-full bg-danger px-4 py-2 font-ui text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="rounded-full border border-line px-4 py-2 font-ui text-sm text-muted"
      >
        Cancel
      </button>
    </div>
  );
}
