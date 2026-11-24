// Student batches a post targets (tasks.batches, text[]). "All" = every batch, incl. future ones.
// Empty / null = not specified (shown as "—").

export const ALL_BATCHES = "All";

/** Sheet cell → batches. "2025, 2026" → ["2025","2026"]; "All" (any case) → ["All"]; "" → []. */
export function parseBatches(cell: unknown): string[] {
  const parts = String(cell ?? "")
    .split(/[,;/&\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.some((p) => p.toLowerCase() === "all" || p.toLowerCase() === "all batches")) return [ALL_BATCHES];
  return [...new Set(parts)];
}

/** Form values (one `batches` input per choice) → stored value (null when none). */
export function batchesFromForm(values: FormDataEntryValue[]): string[] | null {
  const v = [...new Set(values.map((x) => String(x).trim()).filter(Boolean))];
  if (v.includes(ALL_BATCHES)) return [ALL_BATCHES];
  return v.length ? v : null;
}

/** Order-insensitive equality ([] and null are equal). */
export function sameBatches(a: readonly string[] | null | undefined, b: readonly string[] | null | undefined): boolean {
  const x = [...(a ?? [])].sort(), y = [...(b ?? [])].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** "All batches" · "2025, 2026" · "—" */
export function formatBatches(b: readonly string[] | null | undefined): string {
  if (!b || b.length === 0) return "—";
  if (b.includes(ALL_BATCHES)) return "All batches";
  return [...b].sort().join(", ");
}
