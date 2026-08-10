// Builds the WhatsApp reminder content from a reminder_job_details row.

export interface JobDetail {
  job_id: string;
  offset_min: number;
  whatsapp_e164: string;
  boa_name: string;
  university_name: string;
  university_code: string;
  timezone: string;
  task_id: string;
  team: string | null;
  update_type: string | null;
  category: string | null;
  priority: string | null;
  channel: string | null;
  content_type: string | null;
  message_content: string | null;
  special_instructions: string | null;
  publish_at: string | null;
  execution_status: string;
}

function fmtIST(iso: string | null, tz: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: tz || "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** Deep link that opens the BOA UI directly on this task. */
export function deepLink(appUrl: string, code: string, taskId: string): string {
  return `${appUrl.replace(/\/$/, "")}/u/${code}/task/${taskId}`;
}

/**
 * Ordered template variables. Order MUST match the approved template's
 * {{1}}…{{n}} placeholders. Keep this in sync with the registered template.
 */
export function buildReminderVars(d: JobDetail, appUrl: string): Record<string, string> {
  return {
    boa_name: d.boa_name ?? "there",
    university: d.university_name,
    priority: d.priority ?? "Normal",
    channel: d.channel ?? "—",
    content_type: d.content_type ?? "—",
    team: d.team ?? "—",
    detail: [d.update_type, d.category].filter(Boolean).join(" / ") || "—",
    publish_at: fmtIST(d.publish_at, d.timezone),
    minutes: String(d.offset_min),
    notes: (d.special_instructions ?? "").slice(0, 300) || "—",
    link: deepLink(appUrl, d.university_code, d.task_id),
  };
}

/** Plain-text preview (used by the Mock provider / logs / non-template channels). */
export function renderPreview(vars: Record<string, string>): string {
  return [
    `🔔 Publish reminder — ${vars.university}`,
    `Priority: ${vars.priority} | Channel: ${vars.channel} | Type: ${vars.content_type}`,
    `Team: ${vars.team} · ${vars.detail}`,
    `Publish at: ${vars.publish_at}  (in ${vars.minutes} min)`,
    `Notes: ${vars.notes}`,
    `👉 Open & complete: ${vars.link}`,
  ].join("\n");
}
