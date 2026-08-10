"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addOption } from "@/app/actions";
import type { Opt } from "@/components/DynamicSelect";

/** Pick "All universities" or any subset. Submits one hidden `university_ids`
 *  input per selected university, so the server fans the entry out to each. */
export function UniversityMultiSelect({ options }: { options: Opt[] }) {
  const [opts, setOpts] = useState<Opt[]>(options);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const allChecked = selected.size === opts.length && opts.length > 0;
  const filtered = useMemo(
    () => opts.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase())),
    [opts, query],
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(opts.map((o) => o.value)));

  async function addUni() {
    const v = text.trim();
    if (!v) return;
    setBusy(true);
    try {
      const opt = await addOption("university", v);
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

  return (
    <div className="rounded-xl border border-line bg-canvas p-3">
      {[...selected].map((id) => (
        <input key={id} type="hidden" name="university_ids" value={id} />
      ))}

      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 font-ui text-sm font-semibold text-ink">
          <input type="checkbox" checked={allChecked} onChange={toggleAll} className="h-4 w-4 accent-[var(--color-accent)]" />
          All universities
          <span className="font-normal text-muted">({selected.size} selected)</span>
        </label>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="font-ui text-xs font-semibold text-accent hover:underline">
            ＋ Add university
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-2 flex gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUni())}
            placeholder="New university name…"
            className="filter-input w-full"
          />
          <button type="button" onClick={addUni} disabled={busy} className="rounded-lg bg-accent px-3 py-2 font-ui text-sm font-semibold text-white disabled:opacity-60">
            {busy ? "…" : "Add"}
          </button>
          <button type="button" onClick={() => { setAdding(false); setText(""); }} className="rounded-lg border border-line px-3 py-2 font-ui text-sm text-muted">
            Cancel
          </button>
        </div>
      )}

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search universities…"
        className="filter-input mb-2 w-full"
      />

      <div className="max-h-52 overflow-y-auto rounded-lg border border-line bg-surface">
        {filtered.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 border-b border-line-soft px-3 py-2 last:border-0 hover:bg-canvas">
            <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} className="h-4 w-4 accent-[var(--color-accent)]" />
            <span className="font-ui text-sm text-ink">{o.label}</span>
          </label>
        ))}
        {filtered.length === 0 && <p className="px-3 py-4 text-center font-ui text-xs text-muted">No matches.</p>}
      </div>

      {selected.size > 1 && (
        <p className="mt-2 font-ui text-xs text-accent">
          This entry will be created for {allChecked ? "all" : selected.size} universities.
        </p>
      )}
    </div>
  );
}
