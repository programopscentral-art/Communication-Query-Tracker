// IST day-window math (India = UTC+5:30, no DST). Returns UTC ISO bounds so
// Postgres timestamptz filters land on the correct IST calendar day.

const IST_OFFSET_MIN = 330;
const DAY = 86_400_000;

export type ViewKey = "yesterday" | "today" | "upcoming" | "week" | "overdue" | "all";

export const VIEW_TABS: { key: ViewKey; label: string }[] = [
  { key: "yesterday", label: "Yesterday" },
  { key: "today", label: "Today" },
  { key: "upcoming", label: "Upcoming" },
];

export const VIEW_DROPDOWN: { key: ViewKey; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "overdue", label: "Overdue" },
  { key: "all", label: "All time" },
];

/** Start of "today" in IST, expressed as a UTC epoch ms. */
function istTodayStartUTC(nowMs = Date.now()): number {
  const ist = new Date(nowMs + IST_OFFSET_MIN * 60000);
  const startIstWall = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  return startIstWall - IST_OFFSET_MIN * 60000;
}

/** Returns {gte, lt} UTC ISO strings (either may be null = unbounded). */
export function istWindow(view: ViewKey, nowMs = Date.now()): { gte: string | null; lt: string | null } {
  const start = istTodayStartUTC(nowMs);
  const iso = (ms: number) => new Date(ms).toISOString();
  switch (view) {
    case "yesterday":
      return { gte: iso(start - DAY), lt: iso(start) };
    case "today":
      return { gte: iso(start), lt: iso(start + DAY) };
    case "upcoming":
      return { gte: iso(start + DAY), lt: null };
    case "week":
      return { gte: iso(start), lt: iso(start + 7 * DAY) };
    case "overdue":
      return { gte: null, lt: iso(nowMs) }; // caller also filters to unfinished
    case "all":
    default:
      return { gte: null, lt: null };
  }
}

export function isViewKey(v: string | undefined): v is ViewKey {
  return !!v && ["yesterday", "today", "upcoming", "week", "overdue", "all"].includes(v);
}
