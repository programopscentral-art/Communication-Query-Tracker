"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { VIEW_TABS, VIEW_DROPDOWN, type ViewKey } from "@/lib/time";

type Tab = { key: ViewKey; label: string };

/** Segmented time tabs + a dropdown for extra ranges. Drives the `?view=` param.
 *  Tabs/dropdown are configurable so different pages (board vs reminders) can
 *  show their own set (e.g. Today/Tomorrow/Upcoming for reminders). */
export function ViewTabs({
  current,
  tabs = VIEW_TABS,
  dropdown = VIEW_DROPDOWN,
}: {
  current: ViewKey;
  tabs?: Tab[];
  dropdown?: Tab[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(view: ViewKey) {
    const p = new URLSearchParams(params.toString());
    p.set("view", view);
    p.delete("date"); // switching to a range clears an active date search
    router.push(`${pathname}?${p.toString()}`);
  }

  const dateActive = !!params.get("date");
  const inTabs = !dateActive && tabs.some((t) => t.key === current);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex rounded-full border border-line bg-surface p-1">
        {tabs.map((t) => {
          const active = !dateActive && current === t.key;
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
        value={inTabs ? "" : dateActive ? "" : current}
        onChange={(e) => e.target.value && go(e.target.value as ViewKey)}
        className="filter-input"
      >
        <option value="">More ranges…</option>
        {dropdown.map((d) => (
          <option key={d.key} value={d.key}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  );
}
