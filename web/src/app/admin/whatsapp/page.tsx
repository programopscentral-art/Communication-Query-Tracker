import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { istWindow } from "@/lib/time";
import { waConfig, waConfigProblem } from "@/lib/whatsapp";
import { loadWaSettings, inQuietHours } from "@/lib/whatsappSender";
import { TEMPLATE_TEXT, BUTTON_BASE, APP_URL, renderTemplate } from "@/lib/whatsappMessages";
import { Reveal } from "@/components/ui/Reveal";
import { ReadOnlyNotice } from "@/components/ReadOnlyNotice";
import { WhatsAppSettingsForm, WhatsAppTestForm, CopyBlock } from "./WhatsAppForms";

export const dynamic = "force-dynamic";

type Problem = { at: string | null; who: string; what: string; error: string };

export default async function WhatsAppPage() {
  const full = isFullAdmin(await requireAdmin());
  const supabase = await createClient();
  const cfg = waConfig();
  const problem = waConfigProblem(cfg);
  const webhookReady = !!process.env.META_APP_SECRET && !!process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  const { gte, lt } = istWindow("today");
  const rj = () => supabase.from("reminder_jobs").select("id", { count: "exact", head: true }).gte("fire_at", gte!).lt("fire_at", lt!);
  const en = () => supabase.from("event_nudges").select("id", { count: "exact", head: true }).gte("created_at", gte!).lt("created_at", lt!);

  const [settings, row, rSent, rDelivered, rRead, rFailed, rSkipped, rPending, nSent, nRead, nFailed, nSkipped, failedJobs, failedNudges, skippedToday] =
    await Promise.all([
      loadWaSettings(supabase),
      supabase.from("app_settings").select("last_whatsapp_run_at, last_whatsapp_run_ok, last_whatsapp_run_message").eq("id", 1).single(),
      rj().eq("status", "sent"),
      rj().in("delivery_status", ["delivered", "read"]),
      rj().eq("delivery_status", "read"),
      rj().eq("status", "failed"),
      rj().eq("status", "skipped"),
      rj().in("status", ["pending", "sending"]),
      en().eq("status", "sent"),
      en().eq("delivery_status", "read"),
      en().eq("status", "failed"),
      en().eq("status", "skipped"),
      supabase
        .from("reminder_jobs")
        .select("fire_at, error, boas(name), tasks(channel, content_type, universities(name))")
        .eq("status", "failed")
        .order("fire_at", { ascending: false })
        .limit(8),
      supabase
        .from("event_nudges")
        .select("created_at, error, boas(name), events(title, universities(name))")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("reminder_jobs").select("skip_reason").eq("status", "skipped").gte("fire_at", gte!).lt("fire_at", lt!).limit(1000),
    ]);

  const last = row.data;
  const n = (r: { count: number | null }) => r.count ?? 0;
  const problems: Problem[] = [
    ...((failedJobs.data ?? []) as unknown as {
      fire_at: string; error: string | null; boas: { name: string } | null;
      tasks: { channel: string | null; content_type: string | null; universities: { name: string } | null } | null;
    }[]).map((j) => ({
      at: j.fire_at,
      who: j.boas?.name ?? "—",
      what: `${[j.tasks?.channel, j.tasks?.content_type].filter(Boolean).join(" · ") || "Publish reminder"} · ${j.tasks?.universities?.name ?? ""}`,
      error: j.error ?? "Failed",
    })),
    ...((failedNudges.data ?? []) as unknown as {
      created_at: string; error: string | null; boas: { name: string } | null; events: { title: string | null; universities: { name: string } | null } | null;
    }[]).map((x) => ({
      at: x.created_at,
      who: x.boas?.name ?? "—",
      what: `Report: ${x.events?.title ?? "event"} · ${x.events?.universities?.name ?? ""}`,
      error: x.error ?? "Failed",
    })),
  ].sort((a, b) => (b.at ?? "").localeCompare(a.at ?? "")).slice(0, 10);

  const skipReasons = new Map<string, number>();
  for (const r of (skippedToday.data ?? []) as { skip_reason: string | null }[]) {
    const k = r.skip_reason ?? "Skipped";
    skipReasons.set(k, (skipReasons.get(k) ?? 0) + 1);
  }

  const mode = !settings.enabled ? "off" : settings.testMode ? "test" : "live";
  const MODE = {
    off: { label: "Off", tone: "bg-line-soft text-muted", text: "Nothing is being sent. Reminders that fall due are skipped." },
    test: {
      label: "Test mode",
      tone: "bg-amber-100 text-amber-900",
      text: `Sending only to ${settings.testNumbers.length} test number${settings.testNumbers.length === 1 ? "" : "s"}. Everyone else is skipped.`,
    },
    live: { label: "Live", tone: "bg-green-100 text-success", text: "Sending to all active staff who have reminders on." },
  }[mode];

  const checklist: { done: boolean; title: string; detail: string }[] = [
    { done: cfg.provider === "meta", title: "Provider set to Meta", detail: "Vercel env WHATSAPP_PROVIDER=meta" },
    { done: !!cfg.phoneNumberId, title: "Phone number ID", detail: "Vercel env META_WABA_PHONE_NUMBER_ID" },
    { done: !!cfg.token, title: "Access token", detail: "Vercel env META_WABA_TOKEN (permanent System User token)" },
    { done: webhookReady, title: "Delivery receipts (webhook)", detail: "Vercel env META_APP_SECRET + WHATSAPP_WEBHOOK_VERIFY_TOKEN, then the callback in Meta" },
    { done: settings.enabled, title: "Sending switched on", detail: "Settings below — start in test mode" },
    { done: settings.enabled && !settings.testMode, title: "Live for all staff", detail: "Untick test mode once the test messages look right" },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Delivery</p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">WhatsApp</h1>
        <p className="mt-2 max-w-2xl font-ui text-sm text-muted">
          Staff get a reminder before each post&apos;s publish time, and event-report reminders after the 10:00 IST check.
          Nothing is ever sent more than {settings.maxLateMin} min late, and nothing during quiet hours
          ({settings.quietStart}–{settings.quietEnd} IST).
        </p>
      </Reveal>

      {/* status */}
      <Reveal delay={0.04} className="mt-6">
        <div className="card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-3 py-1 font-ui text-sm font-semibold ${MODE.tone}`}>{MODE.label}</span>
              <span className="font-ui text-sm text-muted">{MODE.text}</span>
            </div>
            <span className={`rounded-full px-2.5 py-1 font-ui text-xs font-semibold ${problem ? "bg-red-100 text-danger" : "bg-green-100 text-success"}`}>
              {problem ? (cfg.provider === "meta" ? "Meta not fully configured" : "Mock — nothing really sent") : "Connected to Meta"}
            </span>
          </div>
          {problem && <p className="mt-3 font-ui text-xs text-danger">{problem}</p>}
          {settings.enabled && inQuietHours(settings) && (
            <p className="mt-3 font-ui text-xs text-muted">It&apos;s quiet hours right now — nothing goes out until {settings.quietEnd} IST.</p>
          )}
          <p className="mt-3 font-ui text-xs text-muted">
            <span className="font-semibold text-ink">Last run:</span>{" "}
            {last?.last_whatsapp_run_at ? (
              <>
                {fmtIST(last.last_whatsapp_run_at as string)} —{" "}
                <span className={last.last_whatsapp_run_ok ? "text-ink" : "text-danger"}>{last.last_whatsapp_run_message}</span>
              </>
            ) : (
              "not run yet"
            )}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-5 sm:grid-cols-4 lg:grid-cols-6">
            <Stat label="Sent today" value={n(rSent)} />
            <Stat label="Delivered" value={n(rDelivered)} hint="from Meta receipts" />
            <Stat label="Read" value={n(rRead)} />
            <Stat label="Failed" value={n(rFailed)} tone={n(rFailed) ? "text-danger" : undefined} />
            <Stat label="Skipped" value={n(rSkipped)} />
            <Stat label="Still to send" value={n(rPending)} />
          </div>
          <p className="mt-3 font-ui text-xs text-muted">
            Report reminders today: <b className="text-ink">{n(nSent)}</b> sent · {n(nRead)} read · {n(nFailed)} failed · {n(nSkipped)} skipped
          </p>
          {skipReasons.size > 0 && (
            <ul className="mt-3 space-y-1 font-ui text-xs text-muted">
              {[...skipReasons.entries()].sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                <li key={reason}>
                  <b className="text-ink tabular-nums">{count}</b> skipped — {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>

      {/* settings + test */}
      <Reveal delay={0.07} className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="mb-4 font-ui text-sm font-semibold text-ink">Settings</h2>
          {full ? (
            <WhatsAppSettingsForm settings={settings} />
          ) : (
            <div className="space-y-2 font-ui text-sm text-muted">
              <p>Sending: <b className="text-ink">{MODE.label}</b></p>
              <p>Quiet hours: {settings.quietStart}–{settings.quietEnd} IST · skip if late by more than {settings.maxLateMin} min</p>
              <ReadOnlyNotice what="change WhatsApp settings" className="mt-3" />
            </div>
          )}
        </div>
        <div className="card p-6">
          <h2 className="mb-4 font-ui text-sm font-semibold text-ink">Send a test message</h2>
          {full ? <WhatsAppTestForm /> : <ReadOnlyNotice what="send test messages" />}
        </div>
      </Reveal>

      {/* recent problems */}
      <Reveal delay={0.09} className="mt-6">
        <div className="card p-6">
          <h2 className="font-ui text-sm font-semibold text-ink">Recent failures</h2>
          {problems.length === 0 ? (
            <p className="mt-2 font-ui text-sm text-muted">No failed messages. 🎉</p>
          ) : (
            <ul className="mt-3 divide-y divide-line-soft">
              {problems.map((p, i) => (
                <li key={i} className="py-2.5 font-ui text-xs">
                  <p className="text-ink">
                    <b>{p.who}</b> <span className="text-muted">· {p.what} · {fmtIST(p.at)}</span>
                  </p>
                  <p className="mt-0.5 text-danger">{p.error}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>

      {/* setup */}
      <Reveal delay={0.11} className="mt-6">
        <div className="card p-6">
          <h2 className="font-ui text-sm font-semibold text-ink">Setup checklist</h2>
          <ol className="mt-3 space-y-2">
            {checklist.map((c, i) => (
              <li key={c.title} className="flex items-start gap-3 font-ui text-sm">
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${c.done ? "bg-green-100 text-success" : "bg-line-soft text-muted"}`}>
                  {c.done ? "✓" : i + 1}
                </span>
                <span>
                  <span className={c.done ? "text-ink" : "font-semibold text-ink"}>{c.title}</span>
                  <span className="block text-xs text-muted">{c.detail}</span>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-4 font-ui text-xs text-muted">
            Templates in use: <code className="text-ink">{cfg.templates.reminder}</code> and <code className="text-ink">{cfg.templates.event}</code> ·
            language <code className="text-ink">{cfg.lang}</code> · URL button {cfg.urlButton ? "on" : "off"}.
          </p>
        </div>
      </Reveal>

      {/* templates to submit */}
      <Reveal delay={0.13} className="mt-6 grid gap-6 lg:grid-cols-2">
        {(["reminder", "event"] as const).map((k) => {
          const t = TEMPLATE_TEXT[k];
          return (
            <div key={k} className="card p-6">
              <p className="eyebrow mb-1">Template to create in Meta</p>
              <h2 className="font-ui text-sm font-semibold text-ink">{t.title}</h2>
              <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 font-ui text-xs">
                <dt className="text-muted">Name</dt><dd className="font-mono text-ink">{cfg.templates[k]}</dd>
                <dt className="text-muted">Category</dt><dd className="text-ink">{t.category}</dd>
                <dt className="text-muted">Language</dt><dd className="text-ink">English ({cfg.lang})</dd>
                <dt className="text-muted">Button</dt>
                <dd className="text-ink">Visit website · “{t.button}” · Dynamic URL <span className="break-all font-mono">{BUTTON_BASE}{"{{1}}"}</span></dd>
              </dl>
              <p className="mb-1 mt-4 font-ui text-[10px] uppercase tracking-wider text-muted">Body</p>
              <CopyBlock text={t.body} />
              <p className="mb-1 mt-3 font-ui text-[10px] uppercase tracking-wider text-muted">Sample values (Meta asks for these)</p>
              <CopyBlock text={t.sample.map((v, i) => `{{${i + 1}}} = ${v}`).join("\n")} />
              <p className="mb-1 mt-3 font-ui text-[10px] uppercase tracking-wider text-muted">Button sample</p>
              <CopyBlock text={`${BUTTON_BASE}${k === "event" ? "admin/events" : "admin/schedule"}`} />
              <p className="mb-1 mt-3 font-ui text-[10px] uppercase tracking-wider text-muted">How it looks</p>
              <p className="whitespace-pre-line rounded-xl bg-[#e7f8d9] p-3 font-ui text-xs text-ink">{renderTemplate(k, t.sample)}</p>
            </div>
          );
        })}
      </Reveal>

      <Reveal delay={0.15} className="mt-6">
        <div className="card p-6">
          <h2 className="font-ui text-sm font-semibold text-ink">Delivery receipts (webhook)</h2>
          <p className="mt-1 font-ui text-xs text-muted">
            Meta → your app → WhatsApp → Configuration → Webhook → Edit. Use the values below, then subscribe to the <b className="text-ink">messages</b> field.
          </p>
          <p className="mb-1 mt-3 font-ui text-[10px] uppercase tracking-wider text-muted">Callback URL</p>
          <CopyBlock text={`${APP_URL}/api/whatsapp/webhook`} />
          <p className="mt-2 font-ui text-xs text-muted">
            Verify token = the value you put in Vercel as <code className="text-ink">WHATSAPP_WEBHOOK_VERIFY_TOKEN</code>.
            {webhookReady ? " ✓ Both webhook keys are set." : " Not set yet."}
          </p>
        </div>
      </Reveal>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: string }) {
  return (
    <div>
      <p className="font-ui text-[10px] uppercase tracking-wider text-muted">{label}</p>
      <p className={`font-display text-2xl font-bold tabular-nums ${tone ?? "text-ink"}`}>{value.toLocaleString("en-IN")}</p>
      {hint && <p className="font-ui text-[10px] text-muted">{hint}</p>}
    </div>
  );
}
