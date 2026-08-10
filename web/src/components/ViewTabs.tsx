"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { VIEW_TABS, VIEW_DROPDOWN, type ViewKey } from "@/lib/time";

/** Yesterday / Today / Upcoming tabs + a dropdown for extra ranges.
 *  Drives the `?view=` param → server re-renders the filtered window. */
export function ViewTabs({ current }: { current: ViewKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(view: ViewKey) {
    const p = new URLSearchParams(params.toString());
    p.set("view", view);
    router.push(`${pathname}?${p.toString()}`);
  }

  const inTabs = VIEW_TABS.some((t) => t.key === current);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-full border border-line bg-surface p-1">
        {VIEW_TABS.map((t) => {
          const active = current === t.key;
          return (
            <button
              key={t.key}
              onClick={() => go(t.key)}
              className={`relative rounded-full px-4 py-1.5 font-ui text-sm font-medium transition-colors ${
                active ? "text-white" : "text-muted hover:text-ink"
              }`}
            >
              {active && (
                <motion.span
                  layoutId="view-tab"
                  className="absolute inset-0 -z-10 rounded-full bg-accent"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              {t.label}
            </button>
          );
        })}
      </div>

      <select
        value={inTabs ? "" : current}
        onChange={(e) => e.target.value && go(e.target.value as ViewKey)}
        className="filter-input"
      >
        <option value="">More ranges…</option>
        {VIEW_DROPDOWN.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}
