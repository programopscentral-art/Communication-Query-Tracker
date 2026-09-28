import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for trusted server jobs that run without a signed-in
 * user (the scheduled sheet sync). Bypasses RLS — never import from client
 * code, and never expose SUPABASE_SERVICE_ROLE_KEY via a NEXT_PUBLIC_ var.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured on the server.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
