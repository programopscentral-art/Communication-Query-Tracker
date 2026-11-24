"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin, isFullAdmin, READ_ONLY_MESSAGE } from "@/lib/auth";
import { toE164 } from "@/lib/format";
import { waConfig, waConfigProblem, sendTemplate, WaError } from "@/lib/whatsapp";
import { TEMPLATE_TEXT, renderTemplate } from "@/lib/whatsappMessages";

// WhatsApp admin actions (full admins). Return a message state — never throw.
export type WaFormState = { tone?: "error" | "success"; message?: string; detail?: string; at?: number };

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const err = (message: string, detail?: string): WaFormState => ({ tone: "error", message, detail, at: Date.now() });
const ok = (message: string, detail?: string): WaFormState => ({ tone: "success", message, detail, at: Date.now() });
const isTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/** Split a pasted list of numbers (commas, spaces, new lines) into E.164, reporting bad ones. */
function parseNumbers(raw: string): { good: string[]; bad: string[] } {
  const good: string[] = [];
  const bad: string[] = [];
  for (const part of raw.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)) {
    const e = toE164(part);
    if (e) {
      if (!good.includes(e)) good.push(e);
    } else bad.push(part);
  }
  return { good, bad };
}

export async function saveWhatsAppSettings(_prev: WaFormState, fd: FormData): Promise<WaFormState> {
  if (!isFullAdmin(await requireAdmin())) return err(READ_ONLY_MESSAGE);
  const enabled = fd.get("enabled") === "on";
  const testMode = fd.get("test_mode") === "on";
  const quietStart = s(fd, "quiet_start");
  const quietEnd = s(fd, "quiet_end");
  const maxLate = Number.parseInt(s(fd, "max_late"), 10);
  const { good, bad } = parseNumbers(s(fd, "test_numbers"));

  if (bad.length) return err(`These test numbers aren't valid phone numbers: ${bad.join(", ")}`, "Use 10-digit Indian numbers or the full +country format.");
  if (!isTime(quietStart) || !isTime(quietEnd)) return err("Quiet hours need two times like 22:00 and 08:00.");
  if (!Number.isFinite(maxLate) || maxLate < 1 || maxLate > 60) return err("“Skip if late by more than” must be between 1 and 60 minutes.");
  if (enabled && testMode && !good.length) {
    return err("Add at least one test number, or turn test mode off.", "In test mode only the numbers on the test list receive messages — with an empty list nobody would.");
  }
  // Localhost may run the whole flow in mock mode; production must have Meta configured.
  const problem = waConfigProblem(waConfig());
  if (enabled && problem && (waConfig().provider === "meta" || process.env.NODE_ENV === "production")) {
    return err(`Can't switch sending on yet: ${problem}`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({
      whatsapp_enabled: enabled,
      whatsapp_test_mode: testMode,
      whatsapp_test_numbers: good,
      whatsapp_quiet_start: quietStart,
      whatsapp_quiet_end: quietEnd,
      whatsapp_max_late_min: maxLate,
    })
    .eq("id", 1);
  if (error) return err(`Couldn't save: ${error.message}`);
  revalidatePath("/admin/whatsapp");

  const who = testMode ? `test mode — only ${good.length} test number${good.length === 1 ? "" : "s"}` : "all staff";
  return ok(enabled ? `Saved. WhatsApp sending is ON (${who}).` : "Saved. WhatsApp sending is OFF — nothing will be sent.");
}

export async function sendWhatsAppTest(_prev: WaFormState, fd: FormData): Promise<WaFormState> {
  if (!isFullAdmin(await requireAdmin())) return err(READ_ONLY_MESSAGE);
  const to = toE164(s(fd, "to"));
  if (!to) return err("Enter a valid WhatsApp number (10-digit Indian number or +country format).");
  const kind = s(fd, "kind") === "event" ? "event" : "reminder";
  const t = TEMPLATE_TEXT[kind];
  const button = kind === "event" ? "admin/events" : "admin/schedule";

  const cfg = waConfig();
  const problem = waConfigProblem(cfg);
  if (problem && cfg.provider === "meta") return err(problem);
  try {
    const id = await sendTemplate(cfg, to, cfg.templates[kind], [...t.sample], button);
    const preview = renderTemplate(kind, t.sample, button);
    if (cfg.provider === "mock") {
      return ok(`Mock mode — nothing was sent to ${to}.`, `Set WHATSAPP_PROVIDER=meta (plus the Meta keys) in Vercel to send for real. This is what would go out:\n\n${preview}`);
    }
    return ok(`Test “${t.title}” sent to ${to} ✓`, `Meta accepted it (id ${id.slice(0, 24)}…). It should arrive within seconds — if it doesn't, check the delivery status below after a minute.`);
  } catch (e) {
    const w = e instanceof WaError ? e : null;
    return err("WhatsApp didn't accept the test message.", w ? w.message : String(e));
  }
}
