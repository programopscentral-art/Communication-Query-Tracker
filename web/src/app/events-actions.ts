"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, requireAppUser, requireUniversityAccess, isFullAdmin, READ_ONLY_MESSAGE } from "@/lib/auth";
import { runEventSync, describeEventSync, recordEventSyncStatus } from "@/lib/eventSync";
import { DETAIL_FIELDS, TRACKING_FIELDS, REPORT_FIELDS } from "@/lib/events";
import { runEventNudges, describeNudges, recordNudgeRun, loadNudgeSettings } from "@/lib/eventNudges";

// Event Reports actions. All return a message state (useActionState) instead of
// throwing, so problems show inline — never the error page.
export type EventFormState = { tone?: "error" | "success"; message?: string; at?: number };

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const orNull = (v: string) => (v ? v : null);
const err = (message: string): EventFormState => ({ tone: "error", message, at: Date.now() });
const ok = (message: string): EventFormState => ({ tone: "success", message, at: Date.now() });

/** "2026-09-05" → "05/09/2026" (how the team writes dates in the sheet). */
const toSheetDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

function revalidateEvents(code?: string | null) {
  revalidatePath("/admin/events", "layout");
  if (code) revalidatePath(`/u/${code}/events`, "layout");
}

// ── Sync now (full admin) ────────────────────────────────────────────────────
export type EventSyncState = { error?: string; message?: string };
export async function syncEventsNow(_prev: EventSyncState, _fd: FormData): Promise<EventSyncState> {
  if (!isFullAdmin(await requireAdmin())) return { error: READ_ONLY_MESSAGE };
  const supabase = await createClient();
  try {
    const r = await runEventSync(supabase);
    const message = describeEventSync(r);
    await recordEventSyncStatus(supabase, "manual", true, message);
    revalidateEvents();
    return { message };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    await recordEventSyncStatus(supabase, "manual", false, message);
    revalidatePath("/admin/events");
    return { error: message };
  }
}

// ── Create (full admin): one event per selected university ───────────────────
export async function createEvents(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  const me = await requireAdmin();
  if (!isFullAdmin(me)) return err(READ_ONLY_MESSAGE);
  const supabase = await createClient();

  const uniIds = [...new Set(fd.getAll("university_ids").map(String).filter(Boolean))];
  const title = s(fd, "title");
  const date = s(fd, "event_date");
  const end = s(fd, "event_end_date");
  if (!uniIds.length) return err("Pick at least one university.");
  if (!title) return err("Give the event a title.");
  if (!isDate(date)) return err("Pick the event date.");
  if (end && (!isDate(end) || end < date)) return err("The end date must be on or after the start date.");

  const base: Record<string, unknown> = {
    origin: "ui",
    title,
    event_date: date,
    event_end_date: end || null,
    event_date_text: end ? `${toSheetDate(date)} - ${toSheetDate(end)}` : toSheetDate(date),
    period: `${date.slice(0, 7)}-01`,
    created_by: me.id,
    updated_by: me.id,
  };
  for (const f of [...DETAIL_FIELDS, ...TRACKING_FIELDS]) base[f.key] = orNull(s(fd, f.key));

  const { data: unis } = await supabase.from("universities").select("id, name").in("id", uniIds);
  const rows = (unis ?? []).map((u) => ({ ...base, university_id: u.id, university_raw: u.name }));
  const { data, error } = await supabase.from("events").insert(rows).select("id");
  if (error) return err(`Couldn't create the event: ${error.message}`);

  revalidateEvents();
  if (data?.length === 1) redirect(`/admin/events/${data[0].id}?created=1`);
  redirect(`/admin/events?month=${date.slice(0, 7)}&created=${data?.length ?? 0}`);
}

// ── Edit event details (full admin) ──────────────────────────────────────────
export async function updateEventDetails(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  const me = await requireAdmin();
  if (!isFullAdmin(me)) return err(READ_ONLY_MESSAGE);
  const supabase = await createClient();
  const id = s(fd, "id");
  const title = s(fd, "title");
  const date = s(fd, "event_date");
  const end = s(fd, "event_end_date");
  const uniId = s(fd, "university_id");
  if (!title) return err("The event needs a title.");
  if (date && !isDate(date)) return err("That event date isn't valid.");
  if (end && (!date || !isDate(end) || end < date)) return err("The end date must be on or after the start date.");

  const { data: cur } = await supabase.from("events").select("event_date, event_end_date, university_id").eq("id", id).single();
  if (!cur) return err("This event no longer exists.");

  const patch: Record<string, unknown> = { title };
  for (const f of [...DETAIL_FIELDS, ...TRACKING_FIELDS]) patch[f.key] = orNull(s(fd, f.key));
  // Only touch the date / campus if they actually changed (keeps the sheet's wording otherwise).
  if ((date || null) !== cur.event_date || (end || null) !== cur.event_end_date) {
    patch.event_date = date || null;
    patch.event_end_date = end || null;
    patch.event_date_text = date ? (end ? `${toSheetDate(date)} - ${toSheetDate(end)}` : toSheetDate(date)) : null;
    if (date) patch.period = `${date.slice(0, 7)}-01`;
  }
  if (uniId && uniId !== cur.university_id) {
    const { data: u } = await supabase.from("universities").select("name").eq("id", uniId).single();
    patch.university_id = uniId;
    patch.university_raw = u?.name ?? null;
  }
  const { error } = await supabase.from("events").update(patch).eq("id", id);
  if (error) return err(`Couldn't save: ${error.message}`);
  revalidateEvents();
  return ok("Event details saved.");
}

// ── Save the report (the university's staff, or a full admin) ────────────────
export async function saveEventReport(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  await requireAppUser();
  const supabase = await createClient();
  const id = s(fd, "id");
  // Authorize against the event's OWN university (not a URL param).
  const { data: ev } = await supabase.from("events").select("id, universities(code)").eq("id", id).maybeSingle();
  if (!ev) return err("This event isn't available to you.");
  const code = (ev.universities as unknown as { code: string } | null)?.code;
  if (!code) return err("This event isn't linked to a university yet — ask the Student Engagement team.");
  const access = await requireUniversityAccess(code);
  if (!access.canEdit) return err(READ_ONLY_MESSAGE);

  const patch: Record<string, unknown> = {};
  for (const f of REPORT_FIELDS) patch[f.key] = orNull(s(fd, f.key));
  const { data, error } = await supabase.from("events").update(patch).eq("id", id).select("report_filled");
  if (error) return err(`Couldn't save the report: ${error.message}`);
  if (!data?.length) return err("You can't update this event's report.");
  revalidateEvents(code);
  const filled = data[0].report_filled as number;
  return ok(filled >= 7 ? "Report saved — complete ✓" : `Report saved (${filled}/7 key fields filled).`);
}

// ── Delete (full admin) ──────────────────────────────────────────────────────
export async function deleteEvent(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  if (!isFullAdmin(await requireAdmin())) return err(READ_ONLY_MESSAGE);
  const supabase = await createClient();
  const { error } = await supabase.from("events").delete().eq("id", s(fd, "id"));
  if (error) return err(`Couldn't delete: ${error.message}`);
  revalidateEvents();
  redirect("/admin/events?deleted=1");
}

// ── Report reminders: settings + run now (full admin) ────────────────────────
export async function saveNudgeSettings(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  if (!isFullAdmin(await requireAdmin())) return err(READ_ONLY_MESSAGE);
  const num = (k: string) => Number.parseInt(s(fd, k), 10);
  const after = num("after"), escalate = num("escalate"), lookback = num("lookback");
  if (![after, escalate, lookback].every(Number.isFinite)) return err("Enter whole numbers of days.");
  if (after < 0 || after > 60) return err("“Remind after” must be between 0 and 60 days.");
  if (escalate <= after || escalate > 120) return err("“Escalate after” must be more than “remind after” (and at most 120 days).");
  if (lookback < 7 || lookback > 365) return err("“Only chase events from the last” must be between 7 and 365 days.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      event_nudge_enabled: fd.get("enabled") === "on",
      event_nudge_after_days: after,
      event_escalate_after_days: escalate,
      event_nudge_lookback_days: lookback,
    })
    .eq("id", 1);
  if (error) return err(`Couldn't save: ${error.message}`);
  revalidateEvents();
  return ok("Reminder settings saved.");
}

export async function runNudgesNow(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  if (!isFullAdmin(await requireAdmin())) return err(READ_ONLY_MESSAGE);
  const dryRun = s(fd, "mode") !== "run";
  const supabase = await createClient();
  try {
    const settings = await loadNudgeSettings(supabase);
    if (!dryRun && !settings.enabled) return err("Reminders are switched off — turn them on in the settings first.");
    const r = await runEventNudges(supabase, { dryRun });
    const message = describeNudges(r);
    if (!dryRun) await recordNudgeRun(supabase, "manual", true, message);
    revalidateEvents();
    return ok(message);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reminder run failed.";
    if (!dryRun) await recordNudgeRun(supabase, "manual", false, message);
    return err(message);
  }
}

// ── Bulk "Loaded to Zoho" (full admin) ───────────────────────────────────────
const ZOHO_VALUES = new Set(["Yes", "No", "NA"]);
export async function bulkSetZoho(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  if (!isFullAdmin(await requireAdmin())) return err(READ_ONLY_MESSAGE);
  const ids = [...new Set(fd.getAll("ids").map(String).filter(Boolean))];
  const value = s(fd, "zoho_value");
  if (!ids.length) return err("Tick at least one event first.");
  if (!ZOHO_VALUES.has(value) && value !== "clear") return err("Choose Yes, No, NA or Clear.");
  const supabase = await createClient();
  let n = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("events")
      .update({ zoho_status: value === "clear" ? null : value })
      .in("id", ids.slice(i, i + 200))
      .select("id");
    if (error) return err(`Couldn't update: ${error.message}`);
    n += data?.length ?? 0;
  }
  revalidateEvents();
  return ok(value === "clear" ? `Cleared Zoho status on ${n} event${n === 1 ? "" : "s"}.` : `Marked ${n} event${n === 1 ? "" : "s"} “Loaded to Zoho: ${value}”.`);
}

// ── Map a campus name from the sheet to a university (full admin) ────────────
export async function mapCampusName(_prev: EventFormState, fd: FormData): Promise<EventFormState> {
  if (!isFullAdmin(await requireAdmin())) return err(READ_ONLY_MESSAGE);
  const supabase = await createClient();
  const raw = s(fd, "raw");
  const uniId = s(fd, "university_id");
  if (!raw || !uniId) return err("Pick a university.");
  const k = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");

  // Move the alias: remove it from any other university, add it to the chosen one.
  const { data: unis, error: ue } = await supabase.from("universities").select("id, aliases");
  if (ue) return err(ue.message);
  for (const u of unis ?? []) {
    const aliases = (u.aliases ?? []) as string[];
    const has = aliases.some((a) => a.toLowerCase().replace(/[^a-z0-9]+/g, "") === k);
    if (u.id === uniId && !has) {
      const { error } = await supabase.from("universities").update({ aliases: [...aliases, raw] }).eq("id", u.id);
      if (error) return err(error.message);
    } else if (u.id !== uniId && has) {
      const kept = aliases.filter((a) => a.toLowerCase().replace(/[^a-z0-9]+/g, "") !== k);
      const { error } = await supabase.from("universities").update({ aliases: kept }).eq("id", u.id);
      if (error) return err(error.message);
    }
  }
  // Re-link existing events written with this campus name (any spelling that
  // normalizes to the same key). The view keeps this small — no 1000-row cap.
  const { data: names, error: ne } = await supabase.from("v_event_campus_names").select("university_raw");
  if (ne) return err(ne.message);
  const raws = [...new Set((names ?? []).map((n) => n.university_raw as string))]
    .filter((r) => r.toLowerCase().replace(/[^a-z0-9]+/g, "") === k);
  const { data: moved, error } = raws.length
    ? await supabase.from("events").update({ university_id: uniId }).in("university_raw", raws).select("id")
    : { data: [], error: null };
  if (error) return err(error.message);
  revalidateEvents();
  const n = moved?.length ?? 0;
  return ok(`"${raw}" now maps to the chosen university (${n} event${n === 1 ? "" : "s"} updated).`);
}
