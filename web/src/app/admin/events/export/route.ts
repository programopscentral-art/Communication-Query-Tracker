import * as XLSX from "xlsx";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { applyEventFilters, loadOverdueCutoff } from "@/lib/eventQueries";
import { fmtEventDate, periodLabel, reportStatus, REPORT_STATUS_LABEL, REPORT_TOTAL } from "@/lib/events";

// Export the Event Reports list (current filters) as Excel or CSV — same column
// layout as the Event Reports sheet, plus report status and a PingBoard link.
// Read-only: full admins and read-only admins may export.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, unknown> & {
  id: string;
  sheet_key: string | null;
  sheet_seen: Record<string, string | null> | null;
  universities: { name: string; code: string } | null;
};

const COLUMNS: { header: string; width: number; get: (r: Row, appUrl: string) => string }[] = [
  { header: "Unique Key", width: 10, get: (r) => r.sheet_key ?? r.sheet_seen?.sheet_key_raw ?? "" },
  { header: "Event Date", width: 14, get: (r) => (r.event_date_text as string) ?? fmtEventDate(r.event_date as string) },
  { header: "Campus / University Name", width: 18, get: (r) => r.universities?.name ?? (r.university_raw as string) ?? "" },
  { header: "Conducted by", width: 12, get: (r) => str(r.conducted_by) },
  { header: "CMA Assigned", width: 14, get: (r) => str(r.cma_assigned) },
  { header: "Event Category", width: 18, get: (r) => str(r.category) },
  { header: "Event Subcategory", width: 18, get: (r) => str(r.subcategory) },
  { header: "Event Title", width: 32, get: (r) => str(r.title) },
  { header: "Event Coverage by", width: 14, get: (r) => str(r.coverage) },
  { header: "Event Duration\n(in Days)", width: 12, get: (r) => str(r.duration) },
  { header: "Event Mode\n(Online/Offline)", width: 12, get: (r) => str(r.mode) },
  { header: "Event Description\n(3-4 lines)", width: 50, get: (r) => str(r.description) },
  { header: "No of Registrations", width: 12, get: (r) => str(r.registrations) },
  { header: "No of Participants", width: 12, get: (r) => str(r.participants) },
  { header: "Feedback Response Rate (e.g., 150/200)", width: 16, get: (r) => str(r.feedback_rate) },
  { header: "Average Feedback Rating", width: 12, get: (r) => str(r.avg_rating) },
  { header: "Event Feedback", width: 40, get: (r) => str(r.feedback) },
  { header: "What Went Well / Highlights", width: 40, get: (r) => str(r.highlights) },
  { header: "Suggested Improvements", width: 40, get: (r) => str(r.improvements) },
  { header: "Event Photos Link", width: 30, get: (r) => str(r.photos_link) },
  { header: "Registration Form Link", width: 30, get: (r) => str(r.registration_form_link) },
  { header: "Feedback Form Link", width: 30, get: (r) => str(r.feedback_form_link) },
  { header: "Event Recording (If Online)", width: 24, get: (r) => str(r.recording_link) },
  { header: "Loaded to zoho", width: 12, get: (r) => str(r.zoho_status) },
  { header: "Reviewer comments", width: 30, get: (r) => str(r.admin_comments) },
  { header: "Month", width: 10, get: (r) => periodLabel(r.period as string) },
  { header: "Report status", width: 16, get: (r) => REPORT_STATUS_LABEL[reportStatus(r.report_filled as number)] },
  { header: `Report fields filled (of ${REPORT_TOTAL})`, width: 12, get: (r) => String(r.report_filled ?? 0) },
  { header: "Source", width: 22, get: (r) => (r.origin === "sheet" ? `Sheet · ${r.source_tab} row ${r.source_row}` : "Added in PingBoard") },
  { header: "PingBoard link", width: 40, get: (r, app) => `${app}/admin/events/${r.id}` },
];

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/** Neutralise spreadsheet formulas in CSV cells (=, +, @, or "-" not followed by a space). */
function csvSafe(v: string): string {
  return /^[=+@]/.test(v) || /^-[^\s]/.test(v) ? `'${v}` : v;
}
const csvCell = (v: string) => `"${csvSafe(v).replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  await requireAdmin(); // full or read-only admin — exporting only reads
  const url = new URL(req.url);
  const sp = url.searchParams;
  const format = sp.get("format") === "csv" ? "csv" : "xlsx";
  const supabase = await createClient();

  const uniCode = sp.get("uni") || "";
  const { data: uni } = uniCode
    ? await supabase.from("universities").select("id, code").eq("code", uniCode).maybeSingle()
    : { data: null };
  const filters = {
    month: sp.get("month") || "all",
    universityId: uni?.id ?? null,
    status: sp.get("status") || undefined,
    q: sp.get("q") || undefined,
    zoho: sp.get("zoho") || undefined,
    missingOnly: sp.get("missing") === "1",
    overdueCutoff: sp.get("status") === "overdue" ? await loadOverdueCutoff(supabase) : undefined,
  };

  // page through everything (no 1000-row cap)
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await applyEventFilters(
      supabase
        .from("events")
        .select("*, universities(name, code)")
        .order("period")
        .order("event_date", { ascending: true, nullsFirst: false })
        .order("title")
        .range(from, from + 999),
      filters,
    );
    if (error) return new Response(`Export failed: ${error.message}`, { status: 500 });
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? url.origin).replace(/\/$/, "");
  const table = [COLUMNS.map((c) => c.header), ...rows.map((r) => COLUMNS.map((c) => c.get(r, appUrl)))];
  const stamp = [filters.month === "all" ? "all-months" : filters.month, uniCode, filters.status, filters.zoho && `zoho-${filters.zoho}`]
    .filter(Boolean)
    .join("_");
  const filename = `pingboard-events_${stamp}.${format}`;

  if (format === "csv") {
    const body = "﻿" + table.map((line) => line.map(csvCell).join(",")).join("\r\n");
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(table);
  ws["!cols"] = COLUMNS.map((c) => ({ wch: c.width }));
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, table.length - 1), c: COLUMNS.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Events");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
