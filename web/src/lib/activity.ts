import { STATUS_LABEL } from "@/lib/format";

type Change = { from?: unknown; to?: unknown };
export type Changes = {
  status?: Change;
  issue_blocker?: Change;
  actual_publish_date?: Change;
};

/** Human-readable summary of an audit_log `changes` payload. */
export function describeChange(changes: Changes | null): string[] {
  if (!changes) return [];
  const out: string[] = [];
  if (changes.status) {
    const from = STATUS_LABEL[String(changes.status.from)] ?? changes.status.from;
    const to = STATUS_LABEL[String(changes.status.to)] ?? changes.status.to;
    out.push(`Status ${from} → ${to}`);
  }
  if (changes.issue_blocker) {
    out.push(changes.issue_blocker.to ? "Logged a blocker" : "Cleared blocker");
  }
  if (changes.actual_publish_date && changes.actual_publish_date.to) {
    out.push("Marked published");
  }
  return out;
}
