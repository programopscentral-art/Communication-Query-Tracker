// Teams reminder cards — pure helpers (no database, no network), so they can be
// tested on their own. The webhook URL is a SECRET: nothing here ever puts it in a
// message, a log line or a return value meant for the browser.

import { ALLOWED_DOMAIN } from "@/lib/constants";
import { formatBatches } from "@/lib/batches";
import { APP_URL, fmtShortIST } from "@/lib/whatsappMessages";

// ── Webhook URL ──────────────────────────────────────────────────────────────
// Must match set_teams_webhook() in migration 0037 (the database re-checks it).
const WEBHOOK_RE = /^https:\/\/[A-Za-z0-9.-]+\.(logic\.azure\.com|api\.powerplatform\.com)(:443)?\/\S*workflows\/\S+$/;

export type WebhookCheck = { ok: true; hint: string } | { ok: false; message: string };

/** Is this a Teams Workflows (Power Automate) webhook URL? Returns a masked hint to show instead of it. */
export function checkWebhookUrl(raw: string): WebhookCheck {
  const url = raw.trim();
  if (!url) return { ok: false, message: "Paste the webhook URL from the Teams workflow." };
  if (!WEBHOOK_RE.test(url)) {
    return {
      ok: false,
      message:
        "That doesn't look like a Teams Workflows webhook URL. It must start with https:// and come from Teams → the channel → Workflows → “Send webhook alerts to a channel” (a logic.azure.com or api.powerplatform.com link).",
    };
  }
  const m = url.match(WEBHOOK_RE)!;
  return { ok: true, hint: `…${m[1]}` };
}

/** Remove anything that looks like a link from text we show or store (an error body could echo the URL). */
export function scrub(text: string, max = 240): string {
  return text
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/\bsig=[^\s&"']+/gi, "sig=[hidden]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

// ── Who can be tagged ────────────────────────────────────────────────────────
/** A Teams @mention needs the person's work account, i.e. an @nxtwave.co.in email. */
export function isTaggableEmail(email: string | null | undefined): email is string {
  if (!email) return false;
  const e = email.trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+$/.test(e) && e.endsWith(`@${ALLOWED_DOMAIN}`);
}

export const NOT_TAGGED_REASON = `Card posted, but not tagged — no valid @${ALLOWED_DOMAIN} email on the Staff page`;

// ── Replies from Teams ───────────────────────────────────────────────────────
export type PostKind = "ok" | "retry" | "rejected" | "broken";
export type PostResult = { ok: boolean; kind: PostKind; status: number | null; message: string };

/** What a reply means for us. 2xx = Teams accepted it (Workflows answers 202 before it posts). */
export function classifyHttp(status: number): PostKind {
  if (status >= 200 && status < 300) return "ok";
  if (status === 408 || status === 429 || status >= 500) return "retry"; // temporary — try again
  if (status === 401 || status === 403 || status === 404 || status === 410) return "broken"; // URL revoked / flow off or deleted
  return "rejected"; // 400 etc. — Teams didn't like the card
}

export function describeHttp(status: number, body: string): string {
  const b = scrub(body, 160);
  const tail = b ? ` — ${b}` : "";
  switch (classifyHttp(status)) {
    case "ok":
      return "Accepted by Teams";
    case "retry":
      return `Teams is busy or unavailable (HTTP ${status})${tail}`;
    case "broken":
      return `Teams webhook rejected (HTTP ${status}) — the workflow may be turned off, deleted or its URL changed. Check the URL on Admin → Teams.${tail}`;
    default:
      return `Teams rejected the card (HTTP ${status})${tail}`;
  }
}

// ── Quiet hours (IST) ────────────────────────────────────────────────────────
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
/** Is `now` inside the IST window start–end? Handles windows that cross midnight. */
export function inQuietWindow(start: string, end: string, now = new Date()): boolean {
  const ist = new Date(now.getTime() + 330 * 60000);
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const a = toMin(start), b = toMin(end);
  if (a === b) return false;
  return a < b ? m >= a && m < b : m >= a || m < b;
}

// ── Cards ────────────────────────────────────────────────────────────────────
export type CardPerson = { name: string; email: string };

export type ReminderCardInput = {
  offsetMin: number; // 0 = "Send now"
  university: string;
  universityCode: string;
  taskId: string;
  channel: string | null;
  contentType: string | null;
  publishAt: string | null;
  priority: string | null;
  batches: readonly string[] | null;
  tagged: CardPerson[]; // get an @mention
  notTagged: string[]; // names shown in plain text
};

/** Names are shown inside <at>…</at>; keep them plain so the mention text matches exactly. */
const cleanName = (n: string) => n.replace(/[<>*_`~[\]\\]/g, "").replace(/\s+/g, " ").trim() || "Staff";

function mentions(people: CardPerson[]) {
  const entities = people.map((p) => {
    const name = cleanName(p.name);
    return { type: "mention", text: `<at>${name}</at>`, mentioned: { id: p.email.trim().toLowerCase(), name } };
  });
  return { text: entities.map((e) => e.text).join(" "), entities };
}

function message(body: unknown[], actions: unknown[], entities: unknown[]) {
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          actions,
          msteams: { width: "Full", entities },
        },
      },
    ],
  };
}

export function taskUrl(universityCode: string, taskId: string): string {
  return `${APP_URL}/u/${encodeURIComponent(universityCode)}/task/${encodeURIComponent(taskId)}`;
}

/** ONE card for one post at one reminder timing, @mentioning every taggable staff member. */
export function buildReminderCard(d: ReminderCardInput) {
  const when = fmtShortIST(d.publishAt);
  const heading = d.offsetMin > 0 ? `⏰ Publishes in ${d.offsetMin} min — ${when} IST` : `⏰ Reminder — publishes ${when} IST`;
  const what = [d.channel, d.contentType].filter(Boolean).join(" · ") || "Scheduled post";
  const m = mentions(d.tagged);

  const body: unknown[] = [
    { type: "TextBlock", text: heading, weight: "Bolder", size: "Medium", wrap: true },
    { type: "TextBlock", text: `${d.university} · ${what}`, isSubtle: true, spacing: "None", wrap: true },
    m.entities.length
      ? { type: "TextBlock", text: `${m.text} please publish this on time and mark it done in PingBoard.`, wrap: true }
      : { type: "TextBlock", text: "No one could be tagged for this post — please check the staff emails on the Staff page.", color: "Attention", wrap: true },
    {
      type: "FactSet",
      facts: [
        { title: "University", value: d.university },
        { title: "Channel", value: d.channel || "—" },
        { title: "Content type", value: d.contentType || "—" },
        { title: "Publish time", value: `${when} IST` },
        { title: "Priority", value: d.priority || "Normal" },
        { title: "Batches", value: formatBatches(d.batches) },
      ],
    },
  ];
  if (d.offsetMin === 0) body.push({ type: "TextBlock", text: "Sent manually from PingBoard (Send now).", isSubtle: true, size: "Small", wrap: true });
  if (d.notTagged.length) {
    body.push({
      type: "TextBlock",
      text: `Not tagged (no valid @${ALLOWED_DOMAIN} email on the Staff page): ${d.notTagged.map(cleanName).join(", ")}`,
      isSubtle: true,
      size: "Small",
      wrap: true,
    });
  }
  return message(body, [{ type: "Action.OpenUrl", title: "Open task", url: taskUrl(d.universityCode, d.taskId) }], m.entities);
}

/** The "Send test card" card. Optionally tags one person (e.g. to test someone who isn't in the team). */
export function buildTestCard(d: { university: string; sentBy: string; tag: CardPerson | null; at?: Date }) {
  const m = mentions(d.tag ? [d.tag] : []);
  const at = fmtShortIST((d.at ?? new Date()).toISOString());
  const body: unknown[] = [
    { type: "TextBlock", text: `✅ PingBoard test card — ${d.university}`, weight: "Bolder", size: "Medium", wrap: true },
    { type: "TextBlock", text: "If you can see this, the Teams webhook for this university works. Real reminders look like this card, with the post details below.", wrap: true },
    ...(m.entities.length ? [{ type: "TextBlock", text: `Test tag: ${m.text}`, wrap: true }] : []),
    {
      type: "FactSet",
      facts: [
        { title: "Sent by", value: d.sentBy },
        { title: "Sent at", value: `${at} IST` },
      ],
    },
  ];
  return message(body, [{ type: "Action.OpenUrl", title: "Open PingBoard", url: `${APP_URL}/admin/teams` }], m.entities);
}
