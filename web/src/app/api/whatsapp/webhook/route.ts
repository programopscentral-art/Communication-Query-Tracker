import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Meta WhatsApp webhook: delivery receipts (sent → delivered → read, or failed)
// for the messages PingBoard sends. Configure in Meta → App → WhatsApp →
// Configuration: Callback URL = <app>/api/whatsapp/webhook, Verify token =
// WHATSAPP_WEBHOOK_VERIFY_TOKEN, and subscribe to the "messages" field.
// Every POST must carry Meta's X-Hub-Signature-256 (HMAC of the body with META_APP_SECRET).
export const dynamic = "force-dynamic";

/** Meta's one-time verification handshake. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const want = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (want && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === want) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("forbidden", { status: 403 });
}

type StatusEvent = {
  id?: string;
  status?: string;
  timestamp?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
};

export async function POST(req: NextRequest) {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "META_APP_SECRET is not configured." }, { status: 500 });

  const raw = await req.text();
  const got = Buffer.from(req.headers.get("x-hub-signature-256") ?? "");
  const want = Buffer.from(`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  let body: { entry?: { changes?: { value?: { statuses?: StatusEvent[] } }[] }[] };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // nothing usable; don't make Meta retry
  }

  const statuses = (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.statuses ?? []));
  if (!statuses.length) return NextResponse.json({ ok: true }); // e.g. a staff member replied — ignored

  const supabase = createAdminClient();
  let updated = 0;
  for (const s of statuses) {
    if (!s.id || !s.status) continue;
    const err = s.errors?.[0];
    const reason = err
      ? `${err.title || err.message || "Delivery failed"}${err.error_data?.details ? ` — ${err.error_data.details}` : ""}${err.code ? ` (Meta ${err.code})` : ""}`
      : null;
    const at = s.timestamp ? new Date(Number(s.timestamp) * 1000).toISOString() : new Date().toISOString();
    const { data, error } = await supabase.rpc("apply_wa_status", { p_message_id: s.id, p_status: s.status, p_at: at, p_error: reason });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 }); // Meta retries
    updated += (data as number) ?? 0;
  }
  return NextResponse.json({ ok: true, updated });
}
