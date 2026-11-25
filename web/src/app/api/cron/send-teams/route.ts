import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refuseCron } from "@/lib/cronAuth";
import { postToTeams } from "@/lib/teams";
import { loadTeamsSettings, runTeamsSender, describeTeamsRun, recordTeamsRun, supabaseTeamsStore } from "@/lib/teamsSender";
import { scrub } from "@/lib/teamsCard";

// Delivers due post reminders as Teams cards. Called every minute by Supabase
// pg_cron — but only when Teams is on and something is due
// (supabase/migrations/0040_schedule_teams_sender.sql) — with
// `Authorization: Bearer <CRON_SECRET>`. No user session — uses the service role.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const refused = refuseCron(req);
  if (refused) return refused;

  const supabase = createAdminClient();
  try {
    const settings = await loadTeamsSettings(supabase);
    const r = await runTeamsSender(supabaseTeamsStore(supabase), settings, postToTeams);
    const message = describeTeamsRun(r);
    const ok = r.broken.length === 0 && r.tally.cardsFailed === 0;
    if (r.ran) await recordTeamsRun(supabase, ok, message);
    return NextResponse.json({ ok, ran: r.ran, quiet: !!r.quiet, tally: r.tally, message });
  } catch (e) {
    const message = scrub(e instanceof Error ? e.message : "Teams run failed.", 300);
    await recordTeamsRun(supabase, false, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
