"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** A <select> bound to one URL search param; keeps every other param. */
export function ParamSelect({
  param,
  options,
  current,
  label,
}: {
  param: string;
  options: { value: string; label: string }[];
  current: string;
  label: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  function go(v: string) {
    const p = new URLSearchParams(params.toString());
    if (v) p.set(param, v);
    else p.delete(param);
    router.push(`${pathname}?${p.toString()}`);
  }
  return (
    <select aria-label={label} value={current} onChange={(e) => go(e.target.value)} className="filter-input">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
