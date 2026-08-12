import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { setDataSourceMode } from "@/app/actions";
import { Reveal } from "@/components/ui/Reveal";
import { SyncNowButton } from "./SyncNowButton";

// Give the on-demand sync headroom (first full pull can take a while).
export const maxDuration = 60;

export default async function DataSource() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("data_source_mode").eq("id", 1).single();
  const mode = (data?.data_source_mode as "sheet" | "ui") ?? "sheet";

  const [{ count: uiCount }, { count: sheetCount }] = await Promise.all([
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("origin", "ui"),
    supabase.from("tasks").select("*", { count: "exact", head: true }).eq("origin", "sheet"),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <Reveal>
        <p className="eyebrow mb-2">Control</p>
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink">Data source</h1>
        <p className="mt-2 font-ui text-sm text-muted">
          Choose what drives the app. Switching never deletes data — it only decides who is the
          source of truth going forward.
        </p>
      </Reveal>

      <Reveal delay={0.06} className="mt-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <ModeCard
            active={mode === "sheet"}
            mode="sheet"
            title="Google Sheet"
            subtitle="Off — Sheet mode"
            desc="The tracker sheet is the source of truth. Imports sync Sheet → app. On a duplicate, the Sheet version wins."
            count={sheetCount ?? 0}
            countLabel="sheet-sourced entries"
            footer={mode === "sheet" ? <SyncNowButton /> : null}
          />
          <ModeCard
            active={mode === "ui"}
            mode="ui"
            title="This app (UI)"
            subtitle="On — UI mode"
            desc="You author entries here and they save straight to the database. Sheet import is paused so it can't overwrite your UI data."
            count={uiCount ?? 0}
            countLabel="UI-authored entries"
          />
        </div>
      </Reveal>

      <Reveal delay={0.1} className="mt-8">
        <div className="card p-6">
          <p className="eyebrow mb-2">How conflicts are handled</p>
          <ul className="space-y-2 font-ui text-sm text-muted">
            <li>• Both writers save into the same table, so every screen always shows one merged, live view.</li>
            <li>• <b className="text-ink">Duplicate rule:</b> if the same entry exists from both Sheet and UI, the <b className="text-ink">Sheet copy wins</b> — the UI duplicate is dropped on import (matched by content signature).</li>
            <li>• <b className="text-ink">Status edits are safe:</b> re-importing the Sheet never overwrites a BOA&apos;s status/blocker changes on existing rows.</li>
            <li>• In <b className="text-ink">UI mode</b>, the Sheet import is skipped entirely, so UI entries are never clobbered.</li>
          </ul>
        </div>
      </Reveal>
    </div>
  );
}

function ModeCard({
  active,
  mode,
  title,
  subtitle,
  desc,
  count,
  countLabel,
  footer,
}: {
  active: boolean;
  mode: "sheet" | "ui";
  title: string;
  subtitle: string;
  desc: string;
  count: number;
  countLabel: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className={`card p-6 transition-all ${active ? "ring-2 ring-accent" : "opacity-90"}`}>
      <div className="flex items-center justify-between">
        <p className="font-ui text-xs font-semibold uppercase tracking-wider text-muted">{subtitle}</p>
        {active && <span className="rounded-full bg-accent-soft px-2 py-0.5 font-ui text-xs font-semibold text-accent">Active</span>}
      </div>
      <h2 className="mt-2 font-display text-2xl font-bold text-ink">{title}</h2>
      <p className="mt-2 font-ui text-sm text-muted">{desc}</p>
      <p className="mt-3 font-ui text-xs text-muted">
        <span className="text-lg font-bold text-ink">{count.toLocaleString("en-IN")}</span> {countLabel}
      </p>
      {!active && (
        <form action={setDataSourceMode} className="mt-4">
          <input type="hidden" name="mode" value={mode} />
          <button className="w-full rounded-full bg-ink px-5 py-2.5 font-ui text-sm font-semibold text-white transition-colors hover:bg-accent">
            Switch to {title}
          </button>
        </form>
      )}
      {footer}
    </div>
  );
}
