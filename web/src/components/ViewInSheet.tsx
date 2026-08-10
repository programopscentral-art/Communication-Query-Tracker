/** Deep-links to the exact source row/tab in the tracker Google Sheet, for
 *  verification. Renders nothing if we don't have a row reference. */
export function ViewInSheet({
  gid,
  row,
  compact = false,
  label = "View in Sheet",
  sheetId,
}: {
  gid: string | null;
  row: number | null;
  compact?: boolean;
  label?: string;
  sheetId?: string;
}) {
  const id = sheetId ?? process.env.NEXT_PUBLIC_SHEET_ID;
  if (!id || !row) return null;

  const url = `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${gid ?? "0"}&range=A${row}`;

  if (compact) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={`Verify in Google Sheets (row ${row})`}
        className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition-colors hover:border-success hover:text-success"
        aria-label="View in Sheet"
      >
        <SheetIcon />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open row ${row} in Google Sheets`}
      className="inline-flex items-center gap-2 rounded-full border border-line px-3.5 py-2 font-ui text-sm font-semibold text-muted transition-all hover:-translate-y-0.5 hover:border-success hover:text-success"
    >
      <SheetIcon />
      {label} <span className="text-muted">· row {row}</span>
      <span aria-hidden>↗</span>
    </a>
  );
}

function SheetIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
