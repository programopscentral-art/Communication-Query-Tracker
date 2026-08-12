import { STATUS_LABEL } from "@/lib/format";

type Change = { from?: unknown; to?: unknown };
export type Changes = {
  status?: Change;
  issue_blocker?: Change;
  actual_publish_date?: Change;
  edited?: string[];
  deleted?: { university?: string; channel?: string; content_type?: string; message?: string };
};

const FIELD_LABEL: Record<string, string> = {
  team: "team", update_type: "update type", category: "category", priority: "priority",
  channel: "channel", content_type: "content type", target_audience: "audience",
  message: "message", poster: "poster", publish_at: "publish time",
  special_instructions: "instructions", university: "university",
};

/** Human-readable summary of an audit_log `changes` payload. */
export function describeChange(changes: Changes | null): string[] {
  if (!changes) return [];
  const out: string[] = [];
  if (changes.deleted) {
    out.push(`🗑️ Deleted task${changes.deleted.university ? ` — ${changes.deleted.university}` : ""}`);
    return out;
  }
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
  if (changes.edited && changes.edited.length) {
    out.push(`✏️ Edited: ${changes.edited.map((f) => FIELD_LABEL[f] ?? f).join(", ")}`);
  }
  return out;
}
