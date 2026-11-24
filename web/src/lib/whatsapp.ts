import "server-only";
import { randomUUID } from "node:crypto";

// WhatsApp delivery via the Meta WhatsApp Cloud API (or a mock that only logs).
// Configuration lives in server-only env vars (Vercel → Settings → Environment
// Variables); nothing here is ever sent to the browser.
//
//   WHATSAPP_PROVIDER            meta | mock (default mock — nothing is sent)
//   META_WABA_PHONE_NUMBER_ID    WhatsApp Manager → API Setup → Phone number ID
//   META_WABA_TOKEN              permanent System User token
//   META_TEMPLATE_REMINDER       default "pingboard_publish_reminder"
//   META_TEMPLATE_EVENT          default "pingboard_event_report"
//   META_TEMPLATE_LANG           default "en" (must match the approved template's language)
//   META_TEMPLATE_URL_BUTTON     "on" (default) when the templates have the dynamic "Open" URL button
//   META_GRAPH_VERSION           default "v23.0"
//   META_APP_SECRET              App → Settings → Basic → App secret (webhook signature check)
//   WHATSAPP_WEBHOOK_VERIFY_TOKEN any random string; the same value goes into Meta's webhook setup

export type WaConfig = {
  provider: "meta" | "mock";
  phoneNumberId: string;
  token: string;
  version: string;
  lang: string;
  urlButton: boolean;
  templates: { reminder: string; event: string };
};

export function waConfig(): WaConfig {
  const env = (k: string) => (process.env[k] ?? "").trim();
  return {
    provider: env("WHATSAPP_PROVIDER").toLowerCase() === "meta" ? "meta" : "mock",
    phoneNumberId: env("META_WABA_PHONE_NUMBER_ID"),
    token: env("META_WABA_TOKEN"),
    version: env("META_GRAPH_VERSION") || "v23.0",
    lang: env("META_TEMPLATE_LANG") || "en",
    urlButton: (env("META_TEMPLATE_URL_BUTTON") || "on").toLowerCase() !== "off",
    templates: {
      reminder: env("META_TEMPLATE_REMINDER") || "pingboard_publish_reminder",
      event: env("META_TEMPLATE_EVENT") || "pingboard_event_report",
    },
  };
}

/** What's missing before real messages can go out (null = ready). */
export function waConfigProblem(cfg: WaConfig): string | null {
  if (cfg.provider !== "meta") return "WhatsApp provider is not set to Meta (WHATSAPP_PROVIDER=meta) — messages are only logged, not sent.";
  if (!cfg.phoneNumberId) return "META_WABA_PHONE_NUMBER_ID is not set in Vercel.";
  if (!cfg.token) return "META_WABA_TOKEN is not set in Vercel.";
  return null;
}

/** A failed send. `fatal` = a setup problem that will fail every message (stop the run);
 *  `permanent` = this message will never succeed (don't retry); otherwise retry. */
export class WaError extends Error {
  readonly code: number | null;
  readonly permanent: boolean;
  readonly fatal: boolean;
  constructor(message: string, code: number | null, permanent: boolean, fatal: boolean) {
    super(message);
    this.code = code;
    this.permanent = permanent;
    this.fatal = fatal;
  }
}

// Meta error codes → plain-English reasons (https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes)
const FATAL: Record<number, string> = {
  0: "Meta couldn't authenticate the request — check META_WABA_TOKEN.",
  10: "The access token doesn't have WhatsApp permission — regenerate the System User token with whatsapp_business_messaging.",
  190: "The WhatsApp access token is invalid or expired — create a permanent System User token and update META_WABA_TOKEN in Vercel.",
  200: "Permission error — the token's System User must be assigned to the WhatsApp account.",
  131031: "The WhatsApp Business account is locked or restricted by Meta — check WhatsApp Manager.",
  131042: "Meta reports a payment problem — add or fix the payment method in WhatsApp Manager.",
  132000: "The template's variable count doesn't match what PingBoard sends — re-create the template exactly as shown on the WhatsApp page.",
  132001: "The template doesn't exist or isn't approved in this language — check the template name and META_TEMPLATE_LANG.",
  132005: "The template text is too long after filling in the variables.",
  132007: "The template was rejected for a policy reason — see WhatsApp Manager.",
  132012: "The template's parameters don't match its format (e.g. the URL button) — check META_TEMPLATE_URL_BUTTON.",
  132015: "The template is paused by Meta for low quality — see WhatsApp Manager.",
  132016: "The template is disabled by Meta — see WhatsApp Manager.",
  133010: "The sending phone number isn't registered with the Cloud API — finish registration in WhatsApp Manager.",
};
const PERMANENT: Record<number, string> = {
  100: "Meta rejected a parameter (often an invalid phone number).",
  131008: "A required template parameter was missing.",
  131009: "A parameter value was invalid (often the phone number).",
  131021: "Can't send a message to the sending number itself.",
  131026: "Undeliverable — this number may not be on WhatsApp, or hasn't accepted the latest terms.",
  131030: "This number isn't on the Meta test-recipient list — add it under WhatsApp → API Setup, or switch the app to Live.",
  131051: "Unsupported message type.",
};

function classify(status: number, body: unknown): WaError {
  const e = (body as { error?: { code?: number; message?: string; error_data?: { details?: string } } })?.error;
  const code = typeof e?.code === "number" ? e.code : null;
  const meta = [e?.message, e?.error_data?.details].filter(Boolean).join(" — ");
  const tag = code != null ? ` (Meta ${code})` : ` (HTTP ${status})`;
  if (code != null && code in FATAL) return new WaError(FATAL[code] + tag, code, true, true);
  if (status === 401) return new WaError(FATAL[190] + tag, code, true, true);
  if (code != null && code in PERMANENT) return new WaError(PERMANENT[code] + tag, code, true, false);
  // 130429 / 131056 rate limits, 131000 / 131016 service problems, 5xx → try again.
  const retry = status >= 500 || status === 429 || code === 130429 || code === 131056 || code === 131000 || code === 131016;
  return new WaError((meta || "WhatsApp send failed") + tag, code, !retry, false);
}

/** Meta rejects parameters with new lines, tabs or > 4 spaces in a row, and empty text. */
export function cleanParam(v: string | null | undefined, max = 250): string {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  return (s.length > max ? s.slice(0, max - 1) + "…" : s) || "—";
}

/** Send an approved template. Returns Meta's message id (wamid…). */
export async function sendTemplate(
  cfg: WaConfig,
  to: string,
  template: string,
  bodyParams: string[],
  buttonSuffix?: string,
): Promise<string> {
  const number = to.replace(/[^0-9]/g, "");
  if (number.length < 8) throw new WaError("Invalid WhatsApp number.", null, true, false);

  if (cfg.provider === "mock") {
    console.log(`[WhatsApp mock] → +${number} · ${template}`, bodyParams, buttonSuffix ?? "");
    return `mock-${randomUUID()}`;
  }
  const problem = waConfigProblem(cfg);
  if (problem) throw new WaError(problem, null, true, true);

  const components: Record<string, unknown>[] = [
    { type: "body", parameters: bodyParams.map((p) => ({ type: "text", text: cleanParam(p) })) },
  ];
  if (cfg.urlButton && buttonSuffix) {
    components.push({ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: buttonSuffix }] });
  }

  let res: Response;
  try {
    res = await fetch(`https://graph.facebook.com/${cfg.version}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: number,
        type: "template",
        template: { name: template, language: { code: cfg.lang }, components },
      }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new WaError(`Couldn't reach WhatsApp: ${e instanceof Error ? e.message : String(e)}`, null, false, false);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw classify(res.status, body);
  const id = (body as { messages?: { id?: string }[] })?.messages?.[0]?.id;
  if (!id) throw new WaError("WhatsApp accepted the request but returned no message id.", null, false, false);
  return id;
}
