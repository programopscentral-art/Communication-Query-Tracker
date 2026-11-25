import { requireAdmin, isFullAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fmtIST } from "@/lib/format";
import { istWindow } from "@/lib/time";
import { inQuietWindow, isTaggableEmail } from "@/lib/teamsCard";
import { Reveal } from "@/components/ui/Reveal";
import { ReadOnlyNotice } from "@/components/ReadOnlyNotice";
import { TeamsSettingsForm, UniversityToggle, WebhookForm, RemoveWebhookButton, TestCardForm } from "./TeamsForms";

export const dynamic = "force-dynamic";

type Channel = {
  university_id: string;
  enabled: boolean;
  channel_name: string | null;
  webhook_hint: string | null;
  webhook_saved_at: string | null;
  webhook_saved_by: string | null;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_message: string | null;
  last_error_at: string | null;
  last_error: string | null;
};
type StaffLink = { university_id: string; boas: { name: string; email: string | null; active: boolean } | null };
type Card = {
  posted_at: string; kind: string; ok: boolean; http_status: number | null; mentioned: number; not_tagged: number;
  error: string | null; sent_by: string | null; offset_min: number | null;
  universities: { name: string } | null; tasks: { channel: string | null; content_type: string | null } | null;
};

export default async function TeamsPage() {
  const full = isFullAdmin(await requireAdmin());
  const supabase = await createClient();
  const { gte, lt } = istWindow("today");
  const rj = () => supabase.from("reminder_jobs").select("id", { count: "exact", head: true }).gte("fire_at", gte!).lt("fire_at", lt!);

  const [settingsRow, unis, channels, staffLinks, cards, cSent, cNotTagged, cFailed, cSkipped, cPending] = await Promise.all([
    supabase
      .from("app_settings")
      .select("teams_enabled, teams_quiet_start, teams_quiet_end, teams_max_late_min, last_teams_run_at, last_teams_run_ok, last_teams_run_message, whatsapp_enabled")
      .eq("id", 1)
      .single(),
    supabase.from("universities").select("id, name, code, active").order("name"),
    supabase.from("university_teams").select("university_id, enabled, channel_name, webhook_hint, webhook_saved_at, webhook_saved_by, last_test_at, last_test_ok, last_test_message, last_error_at, last_error"),
    supabase.from("university_boas").select("university_id, boas(name, email, active)").eq("receive_reminders", true),
    supabase
      .from("teams_cards")
      .select("posted_at, kind, ok, http_status, mentioned, not_tagged, error, sent_by, offset_min, universities(name), tasks(channel, content_type)")
      .order("posted_at", { ascending: false })
      .limit(15),
    rj().eq("sent_via", "teams").eq("status", "sent"),
    rj().eq("sent_via", "teams").eq("status", "skipped"),
    rj().eq("status", "failed"),
    rj().eq("status", "skipped").is("sent_via", null),
    rj().in("status", ["pending", "sending"]),
  ]);

  const st = settingsRow.data;
  const settings = {
    enabled: !!st?.teams_enabled,
    quietStart: String(st?.teams_quiet_start ?? "22:00").slice(0, 5),
    quietEnd: String(st?.teams_quiet_end ?? "08:00").slice(0, 5),
    maxLateMin: (st?.teams_max_late_min as number | undefined) ?? 5,
  };
  const byUni = new Map(((channels.data ?? []) as Channel[]).map((c) => [c.university_id, c]));
  const staffByUni = new Map<string, { name: string; email: string | null }[]>();
  for (const l of (staffLinks.data ?? []) as unknown as StaffLink[]) {
    if (!l.boas?.active) continue;
    const list = staffByUni.get(l.university_id) ?? [];
    if (!list.some((x) => x.name === l.boas!.name && x.email === l.boas!.email)) list.push({ name: l.boas.name, email: l.boas.email });
    staffByUni.set(l.university_id, list);
  }
  const allUnis = ((unis.data ?? []) as { id: string; name: string; code: string; active: boolean }[]).filter((u) => u.active !== false);
  // Universities with a webhook first, then the rest.
  const ordered = [...allUnis].sort((a, b) => Number(!!byUni.get(b.id)?.webhook_hint) - Number(!!byUni.get(a.id)?.webhook_hint));
  const brokenUnis = allUnis.filter((u) => byUni.get(u.id)?.last_error);
  const onCount = allUnis.filter((u) => byUni.get(u.id)?.enabled).length;
  const n = (r: { count: number | null }) => r.count ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Delivery</p>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-ink">Teams reminders</h1>
        <p className="mt-2 max-w-2xl font-ui text-sm text-muted">
          One card per post per reminder timing goes to the university&apos;s Teams channel and @mentions its staff who have
          reminders on. Nothing is sent more than {settings.maxLateMin} min late, nor during quiet hours ({settings.quietStart}–{settings.quietEnd} IST).
        </p>
      </Reveal>

      {/* status */}
      <Reveal delay={0.04} className="mt-6">
        <div className="card p-6">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-full px-3 py-1 font-ui text-sm font-semibold ${settings.enabled ? "bg-green-100 text-success" : "bg-line-soft text-muted"}`}>
              {settings.enabled ? "On" : "Off"}
            </span>
            <span className="font-ui text-sm text-muted">
              {settings.enabled
                ? `Sending to ${onCount} universit${onCount === 1 ? "y" : "ies"}.`
                : "Nothing is being sent. When switched on, anything already overdue is skipped — never sent late."}
            </span>
          </div>
          {st?.whatsapp_enabled && (
            <p className="mt-3 font-ui text-xs text-danger">WhatsApp sending is on — Teams can&apos;t be switched on until WhatsApp is off.</p>
          )}
          {settings.enabled && inQuietWindow(settings.quietStart, settings.quietEnd) && (
            <p className="mt-3 font-ui text-xs text-muted">It&apos;s quiet hours right now — nothing goes out until {settings.quietEnd} IST.</p>
          )}
          {brokenUnis.length > 0 && (
            <div className="mt-3 rounded-xl border border-danger/40 bg-red-50 px-4 py-2.5 font-ui text-xs text-danger" role="alert">
              {brokenUnis.map((u) => (
                <p key={u.id}>
                  <b>{u.name}:</b> {byUni.get(u.id)!.last_error} <span className="text-danger/70">({fmtIST(byUni.get(u.id)!.last_error_at)})</span>
                </p>
              ))}
            </div>
          )}
          <p className="mt-3 font-ui text-xs text-muted">
            <span className="font-semibold text-ink">Last run:</span>{" "}
            {st?.last_teams_run_at ? (
              <>
                {fmtIST(st.last_teams_run_at as string)} —{" "}
                <span className={st.last_teams_run_ok ? "text-ink" : "text-danger"}>{st.last_teams_run_message}</span>
              </>
            ) : (
              "not run yet"
            )}
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-5 sm:grid-cols-5">
            <Stat label="Tagged today" value={n(cSent)} />
            <Stat label="Not tagged" value={n(cNotTagged)} hint="no valid email" tone={n(cNotTagged) ? "text-warn" : undefined} />
            <Stat label="Failed" value={n(cFailed)} tone={n(cFailed) ? "text-danger" : undefined} />
            <Stat label="Skipped" value={n(cSkipped)} />
            <Stat label="Still to send" value={n(cPending)} />
          </div>
          <p className="mt-3 font-ui text-[11px] text-muted">
            “Sent” means Teams accepted the card. If a card never shows up in the channel, check the workflow&apos;s run history in Teams (Workflows) — PingBoard can&apos;t see inside it.
          </p>
        </div>
      </Reveal>

      {/* settings */}
      <Reveal delay={0.07} className="mt-6">
        <div className="card p-6">
          <h2 className="mb-4 font-ui text-sm font-semibold text-ink">Settings</h2>
          {full ? (
            <TeamsSettingsForm settings={settings} />
          ) : (
            <div className="space-y-2 font-ui text-sm text-muted">
              <p>Teams reminders: <b className="text-ink">{settings.enabled ? "On" : "Off"}</b></p>
              <p>Quiet hours: {settings.quietStart}–{settings.quietEnd} IST · skip if late by more than {settings.maxLateMin} min</p>
              <ReadOnlyNotice what="change Teams settings" className="mt-3" />
            </div>
          )}
        </div>
      </Reveal>

      {/* universities */}
      <Reveal delay={0.09} className="mt-6">
        <div className="card p-6">
          <h2 className="font-ui text-sm font-semibold text-ink">Universities</h2>
          <p className="mt-1 font-ui text-xs text-muted">
            Each university needs its own channel in the “PingBoard Reminders” team, with the workflow “Send webhook alerts to a channel”.
            Paste that workflow&apos;s URL here — it&apos;s stored in the vault and never shown again.
          </p>
          <ul className="mt-4 divide-y divide-line-soft">
            {ordered.map((u) => {
              const c = byUni.get(u.id);
              const staff = staffByUni.get(u.id) ?? [];
              const untaggable = staff.filter((p) => !isTaggableEmail(p.email));
              return (
                <li key={u.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-ui text-sm font-semibold text-ink">
                        {u.name}
                        {c?.channel_name && <span className="ml-2 font-normal text-muted">· {c.channel_name}</span>}
                      </p>
                      <p className="font-ui text-xs text-muted">
                        {c?.webhook_hint ? (
                          <>Webhook saved <span className="font-mono">{c.webhook_hint}</span> · {fmtIST(c.webhook_saved_at)}{c.webhook_saved_by ? ` by ${c.webhook_saved_by}` : ""}</>
                        ) : (
                          "No webhook yet"
                        )}
                      </p>
                      {c?.last_test_at && (
                        <p className={`font-ui text-xs ${c.last_test_ok ? "text-success" : "text-danger"}`}>
                          Last test {fmtIST(c.last_test_at)}: {c.last_test_message}
                        </p>
                      )}
                      {c?.last_error && <p className="font-ui text-xs text-danger">Error: {c.last_error}</p>}
                    </div>
                    {full ? (
                      <UniversityToggle universityId={u.id} enabled={!!c?.enabled} canEnable={!!c?.webhook_hint} />
                    ) : (
                      <span className={`rounded-full px-3 py-1 font-ui text-xs font-semibold ${c?.enabled ? "bg-green-100 text-success" : "bg-line-soft text-muted"}`}>
                        {c?.enabled ? "On" : "Off"}
                      </span>
                    )}
                  </div>

                  <details className="mt-2">
                    <summary className="cursor-pointer font-ui text-xs font-semibold text-accent">
                      Staff who get tagged ({staff.length - untaggable.length} of {staff.length})
                      {untaggable.length > 0 && <span className="text-warn"> · {untaggable.length} can&apos;t be tagged</span>}
                      {full ? " · webhook & test card" : ""}
                    </summary>
                    <div className="mt-3 grid gap-6 lg:grid-cols-2">
                      <div>
                        <p className="font-ui text-xs text-muted">
                          Everyone below must be a member of the “PingBoard Reminders” team, or Teams can&apos;t notify them.
                        </p>
                        <ul className="mt-2 space-y-1 font-ui text-xs">
                          {staff.length === 0 && <li className="text-muted">No active staff with reminders on.</li>}
                          {staff.map((p) => (
                            <li key={`${p.name}|${p.email}`} className={isTaggableEmail(p.email) ? "text-ink" : "text-warn"}>
                              {p.name} — <span className="font-mono">{p.email ?? "no email"}</span>
                              {!isTaggableEmail(p.email) && " · can't be tagged (fix on the Staff page)"}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {full ? (
                        <div className="space-y-5">
                          <WebhookForm universityId={u.id} channelName={c?.channel_name ?? null} hasWebhook={!!c?.webhook_hint} />
                          {c?.webhook_hint && (
                            <>
                              <TestCardForm universityId={u.id} />
                              <RemoveWebhookButton universityId={u.id} />
                            </>
                          )}
                        </div>
                      ) : (
                        <ReadOnlyNotice what="change webhooks or send test cards" />
                      )}
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
        </div>
      </Reveal>

      {/* recent cards */}
      <Reveal delay={0.11} className="mt-6">
        <div className="card p-6">
          <h2 className="font-ui text-sm font-semibold text-ink">Recent cards</h2>
          {(cards.data ?? []).length === 0 ? (
            <p className="mt-2 font-ui text-sm text-muted">No cards posted yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line-soft">
              {((cards.data ?? []) as unknown as Card[]).map((c, i) => (
                <li key={i} className="py-2.5 font-ui text-xs">
                  <p className="text-ink">
                    <b className={c.ok ? "text-success" : "text-danger"}>{c.ok ? "Accepted" : "Failed"}</b>{" "}
                    <span className="text-muted">
                      · {c.universities?.name ?? "—"} ·{" "}
                      {c.kind === "test"
                        ? `test card${c.sent_by ? ` by ${c.sent_by}` : ""}`
                        : `${[c.tasks?.channel, c.tasks?.content_type].filter(Boolean).join(" · ") || "post"} · ${c.offset_min ? `${c.offset_min} min before` : "sent manually"}`}{" "}
                      · {c.mentioned} tagged{c.not_tagged ? `, ${c.not_tagged} not tagged` : ""} · {fmtIST(c.posted_at)}
                      {c.http_status ? ` · HTTP ${c.http_status}` : ""}
                    </span>
                  </p>
                  {c.error && <p className="mt-0.5 text-danger">{c.error}</p>}
                </li>
              ))}
            </ul>
          )}
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
