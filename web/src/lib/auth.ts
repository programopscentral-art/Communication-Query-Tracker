import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/constants";

export type AppUser = {
  id: string;
  email: string;
  role: "admin" | "boa";
  boa_id: string | null;
  full_name: string | null;
  can_view_admin: boolean;
};

/** Whether this user may reach the Admin console (real admin, or granted). */
export function hasAdminAccess(u: AppUser): boolean {
  return u.role === "admin" || u.can_view_admin;
}

/**
 * Require a signed-in, domain-valid user. Redirects to /login otherwise.
 * Wrapped in React cache() so the layout + page (which both call this during
 * one render) share a SINGLE getUser + app_users round-trip instead of doubling
 * them — a big latency win on every navigation.
 */
export const requireAppUser = cache(async (): Promise<AppUser> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAllowedEmail(user.email)) {
    redirect("/login");
  }

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, boa_id, full_name, can_view_admin")
    .eq("id", user.id)
    .single();

  return {
    id: user.id,
    email: user.email!,
    role: (appUser?.role as "admin" | "boa") ?? "boa",
    boa_id: appUser?.boa_id ?? null,
    full_name: appUser?.full_name ?? null,
    can_view_admin: appUser?.can_view_admin ?? false,
  };
});

/** Require Admin-console access (a real admin, or a staff member the admin
 *  explicitly granted access). Redirects everyone else to their landing. */
export async function requireAdmin(): Promise<AppUser> {
  const u = await requireAppUser();
  if (!hasAdminAccess(u)) redirect("/");
  return u;
}

/**
 * STRICT university isolation. Admins may open any university; a BOA/staff may
 * ONLY open universities they are assigned to. Others are bounced to their own
 * (or /login) — they can't even reach the page, not just see empty data.
 */
export async function requireUniversityAccess(code: string): Promise<AppUser> {
  const u = await requireAppUser();
  if (u.role === "admin") return u;

  const supabase = await createClient();
  // my_university_ids() (via RLS helper) + code match — one round trip.
  const { data } = await supabase
    .from("universities")
    .select("id, code, university_boas!inner(boa_id)")
    .eq("code", code)
    .eq("university_boas.boa_id", u.boa_id)
    .maybeSingle();

  if (!data) {
    // not assigned here → send them to their own first university, else login
    const { data: mine } = await supabase
      .from("university_boas")
      .select("universities(code)")
      .limit(1);
    const myCode = (mine?.[0]?.universities as { code?: string } | null)?.code;
    redirect(myCode ? `/u/${myCode}` : "/login");
  }
  return u;
}
