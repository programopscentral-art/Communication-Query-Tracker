"use client";

import { useState } from "react";

/** Message/Content textarea with a live word counter (target 70+ words). */
export function MessageField({ name, defaultValue = "" }: { name: string; defaultValue?: string }) {
  const [val, setVal] = useState(defaultValue);
  const words = val.trim() ? val.trim().split(/\s+/).length : 0;
  const ok = words >= 70;
  return (
    <div>
      <textarea
        name={name}
        rows={6}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Write the full message / content (aim for 70+ words)…"
        className="filter-input w-full font-display leading-relaxed"
      />
      <p className={`mt-1 font-ui text-xs ${ok ? "text-success" : "text-muted"}`}>
        {words} words {ok ? "✓" : "· aim for 70+"}
      </p>
    </div>
  );
}
