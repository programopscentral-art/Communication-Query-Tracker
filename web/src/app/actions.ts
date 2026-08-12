"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireAppUser, requireAdmin } from "@/lib/auth";
import { runSheetSync } from "@/lib/sheetSync";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ── Sync now: pull the Google Sheet on demand (admin, Sheet mode only) ───────
export type SyncState = { error?: string; message?: string };

export async function syncSheetNow(_prev: SyncState, _fd: FormData): Promise<SyncState> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: settings } = await supabase.from("app_settings").select("data_source_mode").eq("id", 1).single();
  if (settings?.data_source_mode !== "sheet") {
    return { error: "Sync is only allowed in Sheet mode. Switch the data source to Google Sheet first." };
  }

  try {
    const r = await runSheetSync(supabase);
    revalidatePath("/admin/data-source");
    revalidatePath("/admin/schedule");
    revalidatePath("/admin");
    const parts: string[] = [];
    if (r.inserted) parts.push(`${r.inserted} new`);
    if (r.updated) parts.push(`${r.updated} status update${r.updated === 1 ? "" : "s"}`);
    if (r.created) parts.push(`${r.created} new universit${r.created === 1 ? "y" : "ies"}`);
    return {
      message: parts.length
        ? `Synced ✓ — ${parts.join(", ")} (${r.scanned} rows scanned).`
        : `Up to date ✓ — nothing changed (${r.scanned} rows scanned).`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sync failed." };
  }
}

/** BOA (or admin) updates a task's execution progress. RLS enforces access. */
export async function updateTask(formData: FormData) {
  const user = await requireAppUser();
  const supabase = await createClient();

  const id = String(formData.get("task_id"));
  const status = String(formData.get("execution_status"));
  const issue = (formData.get("issue_blocker") as string | null)?.trim() || null;
  const code = String(formData.get("code"));

  const patch: Record<string, unknown> = {
    execution_status: status,
    issue_blocker: issue,
    updated_by: user.id,
  };
  // Stamp the actual publish time when marking published.
  if (status === "published") {
    patch.actual_publish_date = new Date().toISOString();
  }

  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/u/${code}/task/${id}`);
  revalidatePath(`/u/${code}`);
}

/** Save a university's reminder timing (offsets + auto/manual). Admin or that
 *  university's staff (RLS on reminder_prefs enforces who can write). */
export async function saveReminderPrefs(formData: FormData) {
  await requireAppUser();
  const supabase = await createClient();

  const universityId = String(formData.get("university_id"));
  const code = String(formData.get("code"));
  const auto = formData.get("auto_enabled") === "on";
  const offsets = (formData.getAll("offset") as string[])
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a);

  const { error } = await supabase.from("reminder_prefs").upsert(
    {
      university_id: universityId,
      offsets_min: offsets.length ? offsets : [15, 10],
      auto_enabled: auto,
    },
    { onConflict: "university_id" },
  );
  if (error) throw new Error(error.message);

  revalidatePath(`/u/${code}`);
}

/** Manual "send now" — queue an immediate WhatsApp reminder for a task.
 *  Returns the number of BOAs it was queued to. */
export async function sendReminderNow(taskId: string, code: string): Promise<number> {
  await requireAppUser();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("enqueue_manual_reminder", { p_task_id: taskId });
  if (error) throw new Error(error.message);

  revalidatePath(`/u/${code}/task/${taskId}`);
  return (data as number) ?? 0;
}

/** Admin-only full content edit of a task. Keeps source_key stable so a later
 *  sheet sync won't re-insert the row as a duplicate. */
export async function updateTaskFull(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = s(formData, "task_id");
  const code = s(formData, "code");

  const patch = {
    university_id: s(formData, "university_id") || undefined,
    team: s(formData, "team") || null,
    update_type: s(formData, "update_type") || null,
    category: s(formData, "category") || null,
    priority: s(formData, "priority") || "Normal",
    channel: s(formData, "channel") || null,
    content_type: s(formData, "content_type") || null,
    target_audience: s(formData, "target_audience") || null,
    message_content: s(formData, "message_content") || null,
    poster_drive_link: s(formData, "poster_drive_link") || null,
    publish_at: istLocalToUTC(s(formData, "publish_at") || null),
    special_instructions: s(formData, "special_instructions") || null,
  };
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/u/${code}/task/${id}`);
  revalidatePath(`/u/${code}`);
  redirect(`/u/${code}/task/${id}`);
}

/** Admin-only delete of a task (cascades its reminders; audited). */
export async function deleteTask(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = s(formData, "task_id");
  const code = s(formData, "code");

  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath(`/u/${code}`);
  revalidatePath("/admin/schedule");
  redirect(`/u/${code}`);
}

/** Admin posts an internal (admin-only) message. */
export async function postInternalMessage(formData: FormData) {
  const user = await requireAdmin();
  const supabase = await createClient();

  const body = String(formData.get("body")).trim();
  if (!body) return;

  const { error } = await supabase
    .from("internal_messages")
    .insert({ body, author_id: user.id });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/comms");
}

// ── Staff (BOA) management — admin only ──────────────────────────────────────
export type StaffFormState = { error?: string };

/** Turn a Postgres/Supabase error into a clear, human message for the admin. */
function friendlyDbError(e: { code?: string; message?: string; details?: string }): string {
  const blob = `${e.message ?? ""} ${e.details ?? ""}`.toLowerCase();
  if (e.code === "23505" || blob.includes("duplicate key")) {
    if (blob.includes("whatsapp")) return "That WhatsApp number is already assigned to another staff member.";
    if (blob.includes("employee_id")) return "That Employee ID already exists.";
    return "A staff member with these details already exists.";
  }
  if (blob.includes("whatsapp_e164_format") || blob.includes("check constraint")) {
    return "WhatsApp number must be valid E.164 (e.g. +919876543210) — no spaces or dashes.";
  }
  return e.message || "Could not save. Please check the details and try again.";
}

// useActionState-compatible: (prevState, formData) → state. Returns an error to
// show inline instead of throwing (which would white-screen the page).
export async function createStaff(
  _prev: StaffFormState,
  formData: FormData,
): Promise<StaffFormState> {
  await requireAdmin();
  const supabase = await createClient();

  const universityId = s(formData, "university_id");
  const { data: boa, error } = await supabase
    .from("boas")
    .insert({
      employee_id: s(formData, "employee_id"),
      name: s(formData, "name"),
      designation: s(formData, "designation") || null,
      whatsapp_e164: s(formData, "whatsapp_e164"),
      email: s(formData, "email") || null,
    })
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error) };

  if (universityId) {
    const { error: aerr } = await supabase.from("university_boas").insert({
      university_id: universityId,
      boa_id: boa.id,
      role: s(formData, "role") || "primary",
      team_scope: s(formData, "team_scope"),
      receive_reminders: formData.get("receive_reminders") === "on",
    });
    // Roll back the orphan boa if the assignment failed, then report.
    if (aerr) {
      await supabase.from("boas").delete().eq("id", boa.id);
      return { error: friendlyDbError(aerr) };
    }
  }
  revalidatePath("/admin/staff");
  redirect(`/admin/staff/${boa.id}`);
}

export async function updateStaff(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = s(formData, "boa_id");
  const { error } = await supabase
    .from("boas")
    .update({
      name: s(formData, "name"),
      designation: s(formData, "designation") || null,
      whatsapp_e164: s(formData, "whatsapp_e164"),
      email: s(formData, "email") || null,
      active: formData.get("active") === "on",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/staff/${id}`);
}

export async function upsertAssignment(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const boaId = s(formData, "boa_id");
  const { error } = await supabase.from("university_boas").upsert(
    {
      university_id: s(formData, "university_id"),
      boa_id: boaId,
      role: s(formData, "role") || "primary",
      team_scope: s(formData, "team_scope"),
      receive_reminders: formData.get("receive_reminders") === "on",
    },
    { onConflict: "university_id,boa_id,team_scope" },
  );
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/staff/${boaId}`);
}

export async function removeAssignment(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const boaId = s(formData, "boa_id");
  const { error } = await supabase
    .from("university_boas")
    .delete()
    .eq("university_id", s(formData, "university_id"))
    .eq("boa_id", boaId)
    .eq("team_scope", s(formData, "team_scope"));
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/staff/${boaId}`);
}

// ── Tickets ──────────────────────────────────────────────────────────────────
export async function createTicket(formData: FormData) {
  const user = await requireAppUser();
  const supabase = await createClient();
  const code = s(formData, "code");

  const { data: uni } = await supabase.from("universities").select("id").eq("code", code).single();
  const tags = s(formData, "tags")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const { error } = await supabase.from("tickets").insert({
    university_id: uni?.id ?? null,
    raised_by: user.id,
    raised_by_name: user.full_name ?? user.email,
    raised_by_email: user.email,
    subject: s(formData, "subject"),
    description: s(formData, "description") || null,
    priority: s(formData, "priority") || "normal",
    tags,
    link: s(formData, "link") || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/u/${code}/tickets`);
}

export async function updateTicketStatus(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = s(formData, "ticket_id");
  const { error } = await supabase
    .from("tickets")
    .update({ status: s(formData, "status") })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tickets");
}

/** Optionally tag a ticket to a person (an app user). Empty clears it. Admin only. */
export async function assignTicket(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = s(formData, "ticket_id");
  const assignee = s(formData, "assigned_to");

  let patch: Record<string, unknown> = {
    assigned_to: null,
    assigned_to_name: null,
    assigned_to_email: null,
    assigned_at: null,
  };
  if (assignee) {
    const { data: u } = await supabase
      .from("app_users")
      .select("id, full_name, email")
      .eq("id", assignee)
      .single();
    patch = {
      assigned_to: u?.id ?? null,
      assigned_to_name: u?.full_name ?? u?.email ?? null,
      assigned_to_email: u?.email ?? null,
      assigned_at: new Date().toISOString(),
    };
  }
  const { error } = await supabase.from("tickets").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/tickets");
}

// ── Announcement bar management — admin only ─────────────────────────────────
export async function createAnnouncement(formData: FormData) {
  const user = await requireAdmin();
  const supabase = await createClient();
  const uni = s(formData, "university_id");
  const { error } = await supabase.from("announcements").insert({
    university_id: uni || null,
    message: s(formData, "message"),
    kind: s(formData, "kind") || "info",
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/announcements");
}

export async function setAnnouncementActive(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("announcements")
    .update({ active: formData.get("active") === "true" })
    .eq("id", s(formData, "id"));
  if (error) throw new Error(error.message);
  revalidatePath("/admin/announcements");
}

// Grant / revoke Admin-console access for a staff member (admin only).
export async function setAdminAccess(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const boaId = s(formData, "boa_id");
  const on = formData.get("can_view_admin") === "true";
  const { error } = await supabase.from("app_users").update({ can_view_admin: on }).eq("boa_id", boaId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/staff/${boaId}`);
}

// ── Admin Access: promote/demote a @nxtwave.co.in email to full admin ────────
export async function grantAdmin(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const email = s(formData, "email").toLowerCase();
  if (!email.endsWith("@nxtwave.co.in")) throw new Error("Only @nxtwave.co.in emails can be admins.");

  // Persist in the allowlist (so it sticks even on re-provision)…
  const { error: e1 } = await supabase.from("admin_emails").upsert({ email }, { onConflict: "email" });
  if (e1) throw new Error(e1.message);
  // …and promote them now if they've already signed in.
  await supabase.from("app_users").update({ role: "admin" }).eq("email", email);

  revalidatePath("/admin/access");
}

export async function revokeAdmin(formData: FormData) {
  const me = await requireAdmin();
  const supabase = await createClient();
  const email = s(formData, "email").toLowerCase();
  if (email === me.email.toLowerCase()) throw new Error("You can't revoke your own admin access.");

  await supabase.from("admin_emails").delete().eq("email", email);
  await supabase.from("app_users").update({ role: "boa" }).eq("email", email);

  revalidatePath("/admin/access");
}

// ── UI authoring: dynamic dropdowns + direct task creation ───────────────────
const REF_TABLES: Record<string, string> = {
  team: "ref_team",
  update_type: "ref_update_type",
  category: "ref_category",
  priority: "ref_priority",
  channel: "ref_channel",
  content_type: "ref_content_type",
  target_audience: "ref_target_audience",
};

// IST wall-clock (from <input type=datetime-local>) → UTC ISO. India = UTC+5:30.
function istLocalToUTC(v: string | null): string | null {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi) - 330 * 60000).toISOString();
}

function sourceKey(parts: (string | null)[]): string {
  return createHash("sha1").update(parts.map((p) => p ?? "").join("|")).digest("hex");
}

/** Add a new dropdown value (or a new university) — admin only. Returns it. */
export async function addOption(kind: string, value: string): Promise<{ value: string; label: string }> {
  await requireAdmin();
  const supabase = await createClient();
  const v = value.trim();
  if (!v) throw new Error("Empty value");

  if (kind === "university") {
    const code = v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "uni";
    const { data, error } = await supabase
      .from("universities")
      .upsert({ name: v, code, aliases: [v] }, { onConflict: "code" })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    revalidatePath("/admin/compose");
    return { value: data.id as string, label: data.name as string };
  }

  const table = REF_TABLES[kind];
  if (!table) throw new Error("Unknown dropdown");
  const { error } = await supabase.from(table).upsert({ value: v }, { onConflict: "value" });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/compose");
  return { value: v, label: v };
}

/** Create one task directly from the UI. Sheet-identical rows dedupe via
 *  source_key (Sheet wins on later import). Admin / granted only. */
export async function createTaskEntry(formData: FormData) {
  const user = await requireAdmin();
  const supabase = await createClient();

  // One or many universities ("All" checks them all client-side).
  const universityIds = [...new Set(formData.getAll("university_ids").map(String).filter(Boolean))];
  if (universityIds.length === 0) throw new Error("Please select at least one university.");

  const { data: unis } = await supabase
    .from("universities")
    .select("id, name, code")
    .in("id", universityIds);
  if (!unis || unis.length === 0) throw new Error("Selected universities not found.");

  const publish_at = istLocalToUTC(s(formData, "publish_at") || null);
  const channel = s(formData, "channel") || null;
  const content_type = s(formData, "content_type") || null;
  const message = s(formData, "message_content") || null;

  const base = {
    origin: "ui",
    created_source_by: user.id,
    team: s(formData, "team") || null,
    entry_date: s(formData, "entry_date") || null,
    update_type: s(formData, "update_type") || null,
    category: s(formData, "category") || null,
    priority: s(formData, "priority") || "Normal",
    channel,
    content_type,
    target_audience: s(formData, "target_audience") || null,
    message_content: message,
    poster_drive_link: s(formData, "poster_drive_link") || null,
    publish_at,
    special_instructions: s(formData, "special_instructions") || null,
    // Response fields are owned by the university staff — always start clean,
    // regardless of anything sent from the client.
    execution_status: "pending" as const,
    actual_publish_date: null,
    issue_blocker: null,
  };

  // Fan out: one task per selected university, each with its own dedup key.
  const records = unis.map((u) => ({
    ...base,
    university_id: u.id,
    source_key: sourceKey([u.name, publish_at, channel, content_type, (message ?? "").slice(0, 120)]),
  }));

  const { data, error } = await supabase
    .from("tasks")
    .upsert(records, { onConflict: "source_key", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Matching entries already exist for the selected universities — nothing duplicated.");
  }

  revalidatePath("/admin/schedule");
  // Single uni → its board; multiple → the schedule overview.
  if (unis.length === 1) redirect(`/u/${unis[0].code}`);
  redirect("/admin/schedule");
}

/** Flip the source of truth: 'sheet' (import shows) or 'ui' (authoring on). */
export async function setDataSourceMode(formData: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const mode = s(formData, "mode") === "ui" ? "ui" : "sheet";
  const { error } = await supabase.from("app_settings").update({ data_source_mode: mode }).eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/data-source");
}
