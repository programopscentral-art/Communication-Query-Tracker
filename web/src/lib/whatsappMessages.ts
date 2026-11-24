// The two WhatsApp templates PingBoard sends. The body text below is exactly
// what must be submitted to Meta (WhatsApp Manager → Message templates), and the
// parameter builders fill {{1}}…{{n}} in the same order. Change both together.

export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://communication-query-tracker.vercel.app").replace(/\/$/, "");

export const TEMPLATE_TEXT = {
  reminder: {
    title: "Publish reminder",
    category: "Utility",
    body:
      "Hi {{1}}, PingBoard reminder: {{2}} for {{3}} is scheduled at {{4}} (in {{5}} min).\n" +
      "Details: {{6}}\n" +
      "Priority: {{7}}\n" +
      "Please publish it on time and mark it done in PingBoard.",
    button: "Open task",
    sample: ["Ravi", "Instagram · Poster", "Aurora", "1:00 pm, 27 Oct", "15", "Student Engagement / Event update", "High"],
  },
  event: {
    title: "Event report reminder",
    category: "Utility",
    body:
      'Hi {{1}}, the event report for "{{2}}" at {{3}} (held on {{4}}) is still pending.\n' +
      "Please fill it in PingBoard today. Thank you.",
    button: "Fill report",
    sample: ["Ravi", "Tech Fest 2026", "Aurora", "24 Oct 2026"],
  },
} as const;

/** The dynamic part of the URL button: https://<app>/{{1}} */
export const BUTTON_BASE = `${APP_URL}/`;

const IST = "Asia/Kolkata";
const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] || "there";

/** "1:00 pm, 27 Oct" in IST. */
export function fmtShortIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "numeric", minute: "2-digit", hour12: true }).format(d);
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "short" }).format(d);
  return `${time}, ${day}`;
}

export type ReminderInput = {
  boa_name: string | null;
  university_name: string;
  university_code: string;
  task_id: string;
  team: string | null;
  update_type: string | null;
  category: string | null;
  priority: string | null;
  channel: string | null;
  content_type: string | null;
  publish_at: string | null;
};

export function reminderParams(d: ReminderInput, now = Date.now()): { params: string[]; button: string } {
  const minutes = d.publish_at ? Math.max(0, Math.round((new Date(d.publish_at).getTime() - now) / 60000)) : 0;
  return {
    params: [
      firstName(d.boa_name),
      [d.channel, d.content_type].filter(Boolean).join(" · ") || "A scheduled post",
      d.university_name,
      fmtShortIST(d.publish_at),
      String(minutes),
      [d.team, d.update_type, d.category].filter(Boolean).join(" / ") || "—",
      d.priority || "Normal",
    ],
    button: `u/${d.university_code}/task/${d.task_id}`,
  };
}

export type EventInput = {
  boa_name: string | null;
  event_id: string;
  title: string | null;
  university_name: string;
  university_code: string;
  when: string;
};

export function eventParams(d: EventInput): { params: string[]; button: string } {
  return {
    params: [firstName(d.boa_name), d.title || "your event", d.university_name, d.when || "recently"],
    button: `u/${d.university_code}/events/${d.event_id}`,
  };
}

/** Plain-text rendering (admin preview, mock log). */
export function renderTemplate(kind: keyof typeof TEMPLATE_TEXT, params: readonly string[], button?: string): string {
  const t = TEMPLATE_TEXT[kind];
  const body = t.body.replace(/\{\{(\d+)\}\}/g, (_, n) => params[Number(n) - 1] ?? "");
  return button ? `${body}\n[${t.button}] ${BUTTON_BASE}${button}` : body;
}
