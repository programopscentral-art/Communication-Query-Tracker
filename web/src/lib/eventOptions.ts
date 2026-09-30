import type { SupabaseClient } from "@supabase/supabase-js";

/** Suggestions for the event "choice" fields, most-used first (from v_event_options). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadEventOptions(supabase: SupabaseClient<any>): Promise<Record<string, string[]>> {
  const { data } = await supabase.from("v_event_options").select("field, value, n").order("n", { ascending: false });
  const out: Record<string, string[]> = {};
  for (const r of (data ?? []) as { field: string; value: string; n: number }[]) {
    const list = (out[r.field] ??= []);
    // collapse case variants ("Offline" / "offline") to the most-used spelling
    if (!list.some((v) => v.toLowerCase() === r.value.toLowerCase())) list.push(r.value);
  }
  return out;
}
