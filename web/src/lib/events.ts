// Shared Event Reports definitions (used by the sync, admin pages, and staff pages).

export type FieldKind = "text" | "textarea" | "link" | "number-ish" | "choice";
export type FieldDef = { key: string; label: string; kind: FieldKind; hint?: string };

/** Event details — Student Engagement team (full admins) only. */
export const DETAIL_FIELDS: FieldDef[] = [
  { key: "conducted_by", label: "Conducted by", kind: "choice", hint: "NIAT / University" },
  { key: "cma_assigned", label: "CMA assigned", kind: "choice" },
  { key: "category", label: "Event category", kind: "choice" },
  { key: "subcategory", label: "Event subcategory", kind: "choice" },
  { key: "coverage", label: "Event coverage by", kind: "choice", hint: "Students / Branding team / Freelancer" },
  { key: "duration", label: "Event duration", kind: "text", hint: "e.g. 1 day, 2 hrs" },
  { key: "mode", label: "Event mode", kind: "choice", hint: "Offline / Online" },
];

/** Admin-only tracking fields shown alongside the details. */
export const TRACKING_FIELDS: FieldDef[] = [
  { key: "zoho_status", label: "Loaded to Zoho (CRM team)", kind: "choice", hint: "Yes / No / NA" },
  { key: "admin_comments", label: "Reviewer comments", kind: "textarea" },
];

/** The event report — filled by the university's staff. */
export const REPORT_FIELDS: FieldDef[] = [
  { key: "description", label: "Event description (3–4 lines)", kind: "textarea" },
  { key: "registrations", label: "No. of registrations", kind: "number-ish", hint: "A number, or NA" },
  { key: "participants", label: "No. of participants", kind: "number-ish", hint: "A number, or NA" },
  { key: "feedback_rate", label: "Feedback response rate", kind: "text", hint: "e.g. 150/200" },
  { key: "avg_rating", label: "Average feedback rating", kind: "text", hint: "e.g. 4.5/5" },
  { key: "feedback", label: "Event feedback", kind: "textarea" },
  { key: "highlights", label: "What went well / highlights", kind: "textarea" },
  { key: "improvements", label: "Suggested improvements", kind: "textarea" },
  { key: "photos_link", label: "Event photos link", kind: "link" },
  { key: "registration_form_link", label: "Registration form link", kind: "link" },
  { key: "feedback_form_link", label: "Feedback form link", kind: "link" },
  { key: "recording_link", label: "Event recording (if online)", kind: "link" },
];

/** The 7 fields that make a report "complete" (mirrors events.report_filled). */
export const REQUIRED_REPORT_KEYS = [
  "description", "registrations", "participants", "feedback", "highlights", "improvements", "photos_link",
] as const;
export const REPORT_TOTAL = REQUIRED_REPORT_KEYS.length;

export type ReportStatus = "pending" | "partial" | "complete";
export function reportStatus(filled: number | null | undefined): ReportStatus {
  const n = filled ?? 0;
  return n <= 0 ? "pending" : n >= REPORT_TOTAL ? "complete" : "partial";
}
export const REPORT_STATUS_LABEL: Record<ReportStatus, string> = {
  pending: "Report pending",
  partial: "Report in progress",
  complete: "Report complete",
};
export const REPORT_STATUS_STYLE: Record<ReportStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  partial: "bg-blue-100 text-blue-800",
  complete: "bg-green-100 text-green-800",
};

/** "2025-10-01" → "Oct 2025". */
export function periodLabel(period: string | null | undefined): string {
  if (!period) return "—";
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

/** "2025-10-06" → "06 Oct 2025" (dates are stored as plain calendar dates). */
export function fmtEventDate(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function isUrl(v: string | null | undefined): boolean {
  return !!v && /^https?:\/\/\S+$/i.test(v.trim());
}
