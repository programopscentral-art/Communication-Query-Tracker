"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addOption } from "@/app/actions";
import type { Opt } from "@/components/DynamicSelect";
import { ALL_BATCHES } from "@/lib/batches";

/** Optional "Batches" picker (same style as UniversityMultiSelect). "All batches" means every
 *  batch, including future ones, and is stored as ["All"]. Submits one hidden `batches` input
 *  per choice; nothing chosen = no batches. */
export function BatchMultiSelect({ options, defaultValue }: { options: Opt[]; defaultValue?: string[] | null }) {
  const initial = defaultValue ?? [];
  const [opts, setOpts] = useState<Opt[]>(() => {
    // keep any stored value that isn't in the list (e.g. typed in the sheet) visible and selectable
    const extra = initial.filter((v) => v !== ALL_BATCHES && !options.some((o) => o.value === v));
    return [...options, ...extra.map((v) => ({ value: v, label: v }))];
  });
  const [all, setAll] = useState(initial.includes(ALL_BATCHES));
  const [selected, setSelected] = useState<Set<string>>(new Set(initial.filter((v) => v !== ALL_BATCHES)));
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const toggle = (v: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });

  async function addBatch() {
    const v = text.trim();
    if (!v) return;
    setBusy(true);
    try {
      const opt = await addOption("batch", v);
      setOpts((p) => (p.some((o) => o.value === opt.value) ? p : [...p, opt]));
      setSelected((s) => new Set(s).add(opt.value));
      setText("");
      setAdding(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  const submitted = all ? [ALL_BATCHES] : [...selected];

  return (
    <div className="rounded-xl border border-line bg-canvas p-3">
      {submitted.map((v) => (
        <input key={v} type="hidden" name="batches" value={v} />
      ))}

      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 font-ui text-sm font-semibold text-ink">
          <input type="checkbox" checked={all} onChange={() => setAll((a) => !a)} className="h-4 w-4 accent-[var(--color-accent)]" />
          All batches
          <span className="font-normal text-muted">({all ? "every batch, incl. future" : `${selected.size} selected`})</span>
        </label>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="font-ui text-xs font-semibold text-accent hover:underline">
            ＋ Add batch
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-2 flex gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addBatch())}
            placeholder="New batch, e.g. 2027…"
            className="filter-input w-full"
          />
          <button type="button" onClick={addBatch} disabled={busy} className="rounded-lg bg-accent px-3 py-2 font-ui text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "…" : "Add"}
          </button>
          <button type="button" onClick={() => { setAdding(false); setText(""); }} className="rounded-lg border border-line px-3 py-2 font-ui text-sm text-muted">
            Cancel
          </button>
        </div>
      )}

      <div className="max-h-40 overflow-y-auto rounded-lg border border-line bg-surface">
        {opts.map((o) => (
          <label key={o.value} className={`flex items-center gap-2 border-b border-line-soft px-3 py-2 last:border-0 ${all ? "opacity-60" : "cursor-pointer hover:bg-canvas"}`}>
            <input
              type="checkbox"
              checked={all || selected.has(o.value)}
              disabled={all}
              onChange={() => toggle(o.value)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            <span className="font-ui text-sm text-ink">{o.label}</span>
          </label>
        ))}
        {opts.length === 0 && <p className="px-3 py-4 text-center font-ui text-xs text-muted">No batches yet — add one.</p>}
      </div>
    </div>
  );
}
