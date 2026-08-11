"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Search by a specific IST date. Sets ?date=YYYY-MM-DD (and clears ?view=).
 *  Preserves other params (e.g. ?uni=). */
export function DateSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("date") ?? "";

  function set(date: string) {
    const p = new URLSearchParams(params.toString());
    if (date) {
      p.set("date", date);
      p.delete("view");
    } else {
      p.delete("date");
    }
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={current}
        onChange={(e) => set(e.target.value)}
        className="filter-input"
        aria-label="Search reminders by date"
      />
      {current && (
        <button
          type="button"
          onClick={() => set("")}
          className="font-ui text-sm text-muted hover:text-ink"
        >
          Clear date
        </button>
      )}
    </div>
  );
}
