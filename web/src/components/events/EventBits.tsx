import {
  DETAIL_FIELDS,
  REPORT_TOTAL,
  REPORT_STATUS_LABEL,
  REPORT_STATUS_STYLE,
  reportStatus,
  fmtEventDate,
  isUrl,
} from "@/lib/events";

export function ReportBadge({ filled }: { filled: number | null | undefined }) {
  const st = reportStatus(filled);
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 font-ui text-xs font-medium ${REPORT_STATUS_STYLE[st]}`}>
      {REPORT_STATUS_LABEL[st]}
    </span>
  );
}

export function ReportMeter({ filled }: { filled: number | null | undefined }) {
  const n = Math.max(0, Math.min(REPORT_TOTAL, filled ?? 0));
  const pct = Math.round((n / REPORT_TOTAL) * 100);
  return (
    <div className="flex items-center gap-2" title={`${n} of ${REPORT_TOTAL} key report fields filled`}>
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line-soft">
        <div className={`h-full ${n >= REPORT_TOTAL ? "bg-success" : n > 0 ? "bg-info" : "bg-warn"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="font-ui text-[11px] tabular-nums text-muted">{n}/{REPORT_TOTAL}</span>
    </div>
  );
}

/** "06 Oct 2025" or a range; falls back to the sheet's text when it couldn't be read. */
export function EventWhen({ date, end, text }: { date?: string | null; end?: string | null; text?: string | null }) {
  if (!date) return <span className="text-muted">{text || "—"}</span>;
  return <span>{fmtEventDate(date)}{end ? ` – ${fmtEventDate(end)}` : ""}</span>;
}

export function Completion({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line-soft">
        <div className="h-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-ui text-xs tabular-nums text-muted">{pct}%</span>
    </div>
  );
}

/** Read-only event details (what the Student Engagement team entered). */
export function DetailsCard({ event, universityName }: { event: Record<string, unknown>; universityName?: string | null }) {
  const v = (k: string) => (event[k] as string | null) ?? null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
      <Item label="University / campus" value={universityName ?? v("university_raw")} />
      <Item label="Event date" value={<EventWhen date={v("event_date")} end={v("event_end_date")} text={v("event_date_text")} />} />
      {DETAIL_FIELDS.map((f) => <Item key={f.key} label={f.label} value={v(f.key)} />)}
    </dl>
  );
}

function Item({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-ui text-[10px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}

/** Shows a link as a link, anything else as text. */
export function MaybeLink({ value }: { value: string | null | undefined }) {
  if (!value) return <span className="text-muted">—</span>;
  if (isUrl(value)) {
    return (
      <a href={value.trim()} target="_blank" rel="noopener noreferrer" className="break-all font-ui text-sm font-semibold text-info hover:underline">
        Open ↗
      </a>
    );
  }
  return <span className="break-words text-sm text-ink">{value}</span>;
}
