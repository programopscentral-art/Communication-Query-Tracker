"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, isFullAdmin, READ_ONLY_MESSAGE } from "@/lib/auth";
import { checkWebhookUrl, buildTestCard, isTaggableEmail, scrub } from "@/lib/teamsCard";
import { postToTeams } from "@/lib/teams";

// Teams admin actions (FULL admins only). They return a message state and never
// throw. The webhook URL is write-only: it goes straight into Vault through the
// service-role function set_teams_webhook and is never returned, logged or put
// into an error message.
export type TeamsFormState = { tone?: "error" | "success"; message?: string; detail?: string; at?: number };

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const err = (message: string, detail?: string): TeamsFormState => ({ tone: "error", message, detail, at: Date.now() });
const ok = (message: string, detail?: string): TeamsFormState => ({ tone: "success", message, detail, at: Date.now() });
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function fullAdmin() {
  const u = await requireAdmin();
  return isFullAdmin(u) ? u : null;
}

async function universityName(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("universities").select("name").eq("id", id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

export async function saveTeamsSettings(_prev: TeamsFormState, fd: FormData): Promise<TeamsFormState> {
  if (!(await fullAdmin())) return err(READ_ONLY_MESSAGE);
  const enabled = fd.get("enabled") === "on";
  const quietStart = s(fd, "quiet_start");
  const quietEnd = s(fd, "quiet_end");
  const maxLate = Number.parseInt(s(fd, "max_late"), 10);
  if (!isTime(quietStart) || !isTime(quietEnd)) return err("Quiet hours need two times like 22:00 and 08:00.");
  if (!Number.isFinite(maxLate) || maxLate < 1 || maxLate > 60) return err("“Skip if late by more than” must be between 1 and 60 minutes.");

  const supabase = await createClient();
  if (enabled) {
    const { data: st } = await supabase.from("app_settings").select("whatsapp_enabled").eq("id", 1).single();
    if (st?.whatsapp_enabled) {
      return err("WhatsApp sending is switched on.", "Only one reminder channel can be on at a time, so the same reminder is never sent twice. Turn WhatsApp off first.");
    }
    const { data: ready } = await supabase
      .from("university_teams")
      .select("university_id")
      .eq("enabled", true)
      .eq("last_test_ok", true)
      .not("webhook_hint", "is", null)
      .limit(1);
    if (!ready?.length) {
      return err(
        "Not ready to switch on yet.",
        "At least one university needs Teams reminders on, a saved webhook, and a test card that worked. Send a test card first (including the test that tags someone who isn't in the team).",
      );
    }
  }

  const { error } = await supabase
    .from("app_settings")
    .update({ teams_enabled: enabled, teams_quiet_start: quietStart, teams_quiet_end: quietEnd, teams_max_late_min: maxLate })
    .eq("id", 1);
  if (error) {
    if (/one_reminder_channel/.test(error.message)) return err("WhatsApp sending is switched on — turn it off first.");
    return err(`Couldn't save: ${error.message}`);
  }
  revalidatePath("/admin/teams");
  return ok(
    enabled ? "Saved. Teams reminders are ON." : "Saved. Teams reminders are OFF — nothing will be sent.",
    enabled ? "Reminders older than the lateness limit are skipped, never sent late. Cards go only to universities switched on below." : undefined,
  );
}

export async function saveTeamsWebhook(_prev: TeamsFormState, fd: FormData): Promise<TeamsFormState> {
  const u = await fullAdmin();
  if (!u) return err(READ_ONLY_MESSAGE);
  const uni = s(fd, "university_id");
  if (!isUuid(uni)) return err("Unknown university.");
  const check = checkWebhookUrl(s(fd, "url"));
  if (!check.ok) return err(check.message);
  const channelName = s(fd, "channel_name").slice(0, 80) || null;

  const admin = createAdminClient();
  const { error } = await admin.rpc("set_teams_webhook", { p_university_id: uni, p_url: s(fd, "url"), p_hint: check.hint, p_by: u.email });
  // Never echo the database message here: keep the URL out of anything returned.
  if (error) return err("Couldn't save the webhook.", `Database error ${error.code ?? ""}. Nothing was changed.`.trim());
  // A new URL hasn't been tested yet.
  await admin.from("university_teams").update({ channel_name: channelName, last_test_ok: null, last_test_at: null, last_test_message: null }).eq("university_id", uni);

  revalidatePath("/admin/teams");
  return ok("Webhook saved.", `Stored in the vault — it won't be shown again (only “${check.hint}”). Next: send a test card.`);
}

export async function removeTeamsWebhook(_prev: TeamsFormState, fd: FormData): Promise<TeamsFormState> {
  const u = await fullAdmin();
  if (!u) return err(READ_ONLY_MESSAGE);
  const uni = s(fd, "university_id");
  if (!isUuid(uni)) return err("Unknown university.");
  const admin = createAdminClient();
  const { error } = await admin.rpc("set_teams_webhook", { p_university_id: uni, p_url: null, p_hint: null, p_by: u.email });
  if (error) return err("Couldn't remove the webhook.", `Database error ${error.code ?? ""}.`.trim());
  await admin.from("university_teams").update({ last_test_ok: null, last_test_at: null, last_test_message: null, last_error: null, last_error_at: null }).eq("university_id", uni);
  revalidatePath("/admin/teams");
  return ok("Webhook removed and Teams reminders turned off for this university.");
}

export async function setTeamsUniversity(_prev: TeamsFormState, fd: FormData): Promise<TeamsFormState> {
  if (!(await fullAdmin())) return err(READ_ONLY_MESSAGE);
  const uni = s(fd, "university_id");
  if (!isUuid(uni)) return err("Unknown university.");
  const enable = s(fd, "enabled") === "on";
  const supabase = await createClient();
  if (enable) {
    const { data } = await supabase.from("university_teams").select("webhook_hint").eq("university_id", uni).maybeSingle();
    if (!data?.webhook_hint) return err("Save this university's webhook first.");
  }
  const { error } = await supabase.from("university_teams").upsert({ university_id: uni, enabled: enable }, { onConflict: "university_id" });
  if (error) return err(`Couldn't save: ${error.message}`);
  revalidatePath("/admin/teams");
  return ok(enable ? "Teams reminders ON for this university." : "Teams reminders OFF for this university.");
}

export async function sendTeamsTestCard(_prev: TeamsFormState, fd: FormData): Promise<TeamsFormState> {
  const u = await fullAdmin();
  if (!u) return err(READ_ONLY_MESSAGE);
  const uni = s(fd, "university_id");
  if (!isUuid(uni)) return err("Unknown university.");
  const name = await universityName(uni);
  if (!name) return err("Unknown university.");

  const tagEmail = s(fd, "tag_email").toLowerCase();
  let tag: { name: string; email: string } | null = null;
  if (tagEmail) {
    if (!isTaggableEmail(tagEmail)) return err("To tag someone, enter their @nxtwave.co.in email.");
    const supabase = await createClient();
    const { data: b } = await supabase.from("boas").select("name").ilike("email", tagEmail.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle();
    tag = { name: (b?.name as string | undefined) ?? tagEmail.split("@")[0], email: tagEmail };
  }

  const admin = createAdminClient();
  const { data: url, error } = await admin.rpc("get_teams_webhook", { p_university_id: uni });
  if (error) return err("Couldn't read the webhook from the vault.");
  if (!url) return err("No webhook saved for this university yet.");

  const res = await postToTeams(url as string, buildTestCard({ university: name, sentBy: u.email, tag }));
  const message = scrub(res.message, 300);
  await admin.from("teams_cards").insert({
    kind: "test", university_id: uni, ok: res.ok, http_status: res.status, mentioned: tag ? 1 : 0, not_tagged: 0,
    error: res.ok ? null : message, sent_by: u.email,
  });
  await admin
    .from("university_teams")
    .update({
      last_test_at: new Date().toISOString(),
      last_test_ok: res.ok,
      last_test_message: res.ok ? `Accepted by Teams${tag ? ` · tagged ${tag.email}` : ""}` : message,
      ...(res.ok ? { last_error: null, last_error_at: null } : {}),
    })
    .eq("university_id", uni);
  revalidatePath("/admin/teams");

  if (!res.ok) return err("Teams didn't accept the test card.", message);
  return ok(
    `Test card sent to ${name} ✓`,
    `Teams accepted it (HTTP ${res.status}). Check the channel: the card should appear within a minute${tag ? `, and ${tag.email} should get a notification if they're in the team` : ""}. ` +
      "Accepted only means the workflow started — if nothing appears, open the workflow's run history in Teams (Workflows) to see why.",
  );
}
