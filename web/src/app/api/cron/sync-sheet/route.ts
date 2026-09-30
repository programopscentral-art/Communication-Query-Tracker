import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSheetSync, describeSync, recordSyncStatus } from "@/lib/sheetSync";
import { refuseCron } from "@/lib/cronAuth";

// Scheduled Sheet → app sync. Called every few minutes by Supabase pg_cron
// (see supabase/migrations/0022_schedule_sheet_sync.sql) with
// `Authorization: Bearer <CRON_SECRET>`. No user session — uses the service role.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const refused = refuseCron(req);
  if (refused) return refused;

  const supabase = createAdminClient();
  const { data: settings, error } = await supabase
    .from("app_settings").select("data_source_mode").eq("id", 1).single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (settings?.data_source_mode !== "sheet") {
    return NextResponse.json({ ok: true, skipped: "UI mode — sheet sync paused." });
  }

  const started = Date.now();
  try {
    const r = await runSheetSync(supabase);
    const message = describeSync(r);
    await recordSyncStatus(supabase, "auto", true, message);
    return NextResponse.json({ ok: true, ...r, message, ms: Date.now() - started });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    await recordSyncStatus(supabase, "auto", false, message);
    return NextResponse.json({ ok: false, error: message, ms: Date.now() - started }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
