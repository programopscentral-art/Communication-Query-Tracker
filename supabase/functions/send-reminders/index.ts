// Edge Function: send-reminders
// Invoked every minute by pg_cron. Claims due reminder jobs (parallel-safe),
// sends the WhatsApp template via the configured provider, and records results.
//
// Deploy:  npx supabase functions deploy send-reminders --no-verify-jwt
// Secrets: supabase secrets set WHATSAPP_PROVIDER=mock APP_URL=... (see docs)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getProvider } from "../_shared/providers.ts";
import { buildReminderVars, renderPreview, type JobDetail } from "../_shared/message.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";
const TEMPLATE = Deno.env.get("META_WABA_TEMPLATE_NAME") ?? "publish_reminder";
const BATCH = Number(Deno.env.get("REMINDER_BATCH") ?? "200");

Deno.serve(async (req) => {
  // Simple shared-secret guard so only cron/authorized callers can trigger sends.
  const secret = Deno.env.get("DRAINER_SECRET");
  if (secret && req.headers.get("x-drainer-secret") !== secret) {
    return new Response("forbidden", { status: 403 });
  }

  const provider = getProvider();

  // 1. Claim the due slice (marks them 'sending', bumps attempts).
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_due_reminders", {
    p_limit: BATCH,
  });
  if (claimErr) {
    return json({ error: claimErr.message }, 500);
  }
  if (!claimed || claimed.length === 0) {
    return json({ claimed: 0, sent: 0, failed: 0, skipped: 0 });
  }

  const ids = claimed.map((j: { id: string }) => j.id);

  // 2. Fetch enriched details for those jobs.
  const { data: details, error: detErr } = await supabase
    .from("reminder_job_details")
    .select("*")
    .in("job_id", ids);
  if (detErr) {
    return json({ error: detErr.message }, 500);
  }

  let sent = 0, failed = 0, skipped = 0;

  // 3. Send each (sequentially keeps provider rate limits simple; fan out later if needed).
  for (const d of (details ?? []) as JobDetail[]) {
    // Don't remind for work that's already done.
    if (d.execution_status === "published") {
      await supabase.rpc("skip_reminder", { p_id: d.job_id });
      skipped++;
      continue;
    }
    try {
      const vars = buildReminderVars(d, APP_URL);
      // Mock provider logs the readable preview; real providers use vars in order.
      if ((Deno.env.get("WHATSAPP_PROVIDER") ?? "mock") === "mock") {
        console.log(renderPreview(vars));
      }
      const { id } = await provider.sendTemplate(d.whatsapp_e164, TEMPLATE, vars);
      await supabase.rpc("mark_reminder_sent", { p_id: d.job_id, p_wa_message_id: id });
      sent++;
    } catch (e) {
      await supabase.rpc("mark_reminder_failed", {
        p_id: d.job_id,
        p_error: String(e instanceof Error ? e.message : e),
      });
      failed++;
    }
  }

  return json({ claimed: claimed.length, sent, failed, skipped });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
