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

/**
 * Normalize a typed phone to +E.164 (bare 10-digit / 0- / 91- prefixed → +91).
 * Mirrors scripts/import-staff.mjs so UI-entered staff match the DB check
 * constraint (whatsapp_e164_format). Returns null if it can't be made valid.
 */
export function toE164(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;
  if (s.startsWith("+")) {
    const d = "+" + s.slice(1).replace(/\D/g, "");
    return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
  }
  const d = s.replace(/\D/g, "");
  if (d.length === 10) return "+91" + d;
  if (d.length === 11 && d.startsWith("0")) return "+91" + d.slice(1);
  if (d.length === 12 && d.startsWith("91")) return "+" + d;
  if (d.length >= 8 && d.length <= 15) return "+" + d;
  return null;
}

/** UTC ISO → "YYYY-MM-DDTHH:MM" in IST, for <input type="datetime-local"> defaults. */
export function utcToIstLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 330 * 60000).toISOString().slice(0, 16);
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
