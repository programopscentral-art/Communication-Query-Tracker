export const IST = "Asia/Kolkata";

export function fmtIST(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}

/** wa.me deep link from an E.164 number. */
export function waLink(e164: string): string {
  return `https://wa.me/${e164.replace(/[^0-9]/g, "")}`;
}
export function telLink(e164: string): string {
  return `tel:${e164}`;
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  published: "Published",
  blocked: "Blocked",
  restricted: "Restricted",
};

export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  published: "bg-green-100 text-green-800",
  blocked: "bg-red-100 text-red-800",
  restricted: "bg-gray-200 text-gray-700",
};

export const PRIORITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  normal: "bg-gray-100 text-gray-700",
};
