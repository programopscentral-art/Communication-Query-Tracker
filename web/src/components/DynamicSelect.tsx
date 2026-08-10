"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addOption } from "@/app/actions";

export type Opt = { value: string; label: string };

/** A dropdown whose list can be extended inline via "＋ Add new…". New values
 *  are persisted (ref table or university) and immediately selectable. */
export function DynamicSelect({
  name,
  kind,
  options,
  required,
  placeholder = "Select…",
  defaultValue = "",
}: {
  name: string;
  kind: string;
  options: Opt[];
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  const [opts, setOpts] = useState<Opt[]>(options);
  const [value, setValue] = useState(defaultValue);
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  async function add() {
    const v = text.trim();
    if (!v) return;
    setBusy(true);
    setErr(null);
    try {
      const opt = await addOption(kind, v);
      setOpts((p) => (p.some((o) => o.value === opt.value) ? p : [...p, opt]));
      setValue(opt.value);
      setText("");
      setAdding(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input type="hidden" name={name} value={value} />
      {!adding ? (
        <select
          value={value}
          required={required}
          onChange={(e) => (e.target.value === "__add__" ? setAdding(true) : setValue(e.target.value))}
          className="filter-input w-full"
        >
          <option value="">{placeholder}</option>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          <option value="__add__">＋ Add new…</option>
        </select>
      ) : (
        <div className="flex gap-2">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="Type new value…"
            className="filter-input w-full"
          />
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className="rounded-lg bg-accent px-3 py-2 font-ui text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? "…" : "Add"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setText("");
              setErr(null);
            }}
            className="rounded-lg border border-line px-3 py-2 font-ui text-sm text-muted"
          >
            Cancel
          </button>
        </div>
      )}
      {err && <p className="mt-1 font-ui text-xs text-danger">{err}</p>}
    </div>
  );
}
