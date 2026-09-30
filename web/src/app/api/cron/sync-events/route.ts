import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runEventSync, describeEventSync, recordEventSyncStatus } from "@/lib/eventSync";
import { refuseCron } from "@/lib/cronAuth";

// Scheduled Event Reports sheet → app sync (read-only on the sheet). Called by
// Supabase pg_cron (supabase/migrations/0027_schedule_event_sync.sql) with
// `Authorization: Bearer <CRON_SECRET>`. No user session — uses the service role.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const refused = refuseCron(req);
  if (refused) return refused;

  const supabase = createAdminClient();
  const started = Date.now();
  try {
    const r = await runEventSync(supabase);
    const message = describeEventSync(r);
    await recordEventSyncStatus(supabase, "auto", true, message);
    return NextResponse.json({ ok: true, ...r, message, ms: Date.now() - started });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed.";
    await recordEventSyncStatus(supabase, "auto", false, message);
    return NextResponse.json({ ok: false, error: message, ms: Date.now() - started }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
