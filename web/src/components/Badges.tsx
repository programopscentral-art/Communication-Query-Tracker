import { STATUS_LABEL, STATUS_STYLES, PRIORITY_STYLES } from "@/lib/format";

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
