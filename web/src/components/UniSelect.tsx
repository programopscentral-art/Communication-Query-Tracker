"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** University filter that preserves other query params (e.g. ?view=). */
export function UniSelect({
  options,
  current,
}: {
  options: { code: string; name: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function go(code: string) {
    const p = new URLSearchParams(params.toString());
    if (code) p.set("uni", code);
    else p.delete("uni");
    router.push(`${pathname}?${p.toString()}`);
  }

  return (
    <select value={current} onChange={(e) => go(e.target.value)} className="filter-input">
      <option value="">All universities</option>
      {options.map((u) => (
        <option key={u.code} value={u.code}>
          {u.name}
        </option>
      ))}
    </select>
  );
}
