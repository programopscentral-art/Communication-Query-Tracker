import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEventNudges, describeNudges, recordNudgeRun, loadNudgeSettings } from "@/lib/eventNudges";
import { refuseCron } from "@/lib/cronAuth";

// Daily (10:00 IST) reminders for pending event reports. Called by Supabase
// pg_cron (supabase/migrations/0029_schedule_event_nudges.sql) with
// `Authorization: Bearer <CRON_SECRET>`. No user session — uses the service role.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const refused = refuseCron(req);
  if (refused) return refused;

  const supabase = createAdminClient();
  try {
    const settings = await loadNudgeSettings(supabase);
    if (!settings.enabled) return NextResponse.json({ ok: true, skipped: "Event report reminders are switched off." });
    const r = await runEventNudges(supabase);
    const message = describeNudges(r);
    await recordNudgeRun(supabase, "auto", true, message);
    return NextResponse.json({ ok: true, ...r, message });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Reminder run failed.";
    await recordNudgeRun(supabase, "auto", false, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
