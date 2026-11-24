import { STATUS_LABEL, STATUS_STYLES, PRIORITY_STYLES } from "@/lib/format";
import { formatBatches } from "@/lib/batches";

/** Small "Batches: …" tag for board / Schedule rows — shown only when batches are set. */
export function BatchTag({ batches }: { batches: string[] | null | undefined }) {
  if (!batches || batches.length === 0) return null;
  return (
    <span className="inline-block shrink-0 rounded-full bg-line-soft px-2 py-0.5 font-ui text-[11px] text-muted">
      Batches: {formatBatches(batches)}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        STATUS_STYLES[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string | null }) {
  const p = priority ?? "normal";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
        PRIORITY_STYLES[p] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {p.charAt(0).toUpperCase() + p.slice(1)}
    </span>
  );
}
