import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWhatsAppSender, describeWhatsAppRun, recordWhatsAppRun } from "@/lib/whatsappSender";
import { refuseCron } from "@/lib/cronAuth";

// Delivers due WhatsApp reminders. Called every minute by Supabase pg_cron —
// but only when something is due (supabase/migrations/0031_schedule_whatsapp_sender.sql) —
// with `Authorization: Bearer <CRON_SECRET>`. No user session — uses the service role.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest) {
  const refused = refuseCron(req);
  if (refused) return refused;

  const supabase = createAdminClient();
  try {
    const r = await runWhatsAppSender(supabase);
    const message = describeWhatsAppRun(r);
    if (r.ran) await recordWhatsAppRun(supabase, !r.fatal, message);
    return NextResponse.json({ ok: !r.fatal, ...r, message });
  } catch (e) {
    const message = e instanceof Error ? e.message : "WhatsApp run failed.";
    await recordWhatsAppRun(supabase, false, message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
