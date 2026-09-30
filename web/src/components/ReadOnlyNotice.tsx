/** Shown in place of a form/controls when the viewer has read-only access. */
export function ReadOnlyNotice({ what, className = "" }: { what?: string; className?: string }) {
  return (
    <div className={`card border-dashed p-5 ${className}`}>
      <p className="font-ui text-sm font-semibold text-ink">View only</p>
      <p className="mt-1 font-ui text-sm text-muted">
        You have read-only access{what ? `, so you can't ${what}` : ""}. Ask a full admin if something needs to change.
      </p>
    </div>
  );
}
