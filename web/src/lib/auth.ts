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

/** A full admin (role = admin): may create / update / delete everything. */
export function isFullAdmin(u: AppUser): boolean {
  return u.role === "admin";
}

/** Read-only admin: sees the whole Admin console but can't change anything.
 *  (DB: has_admin_read() for reads; writes still need is_admin().) */
export function isReadOnlyAdmin(u: AppUser): boolean {
  return u.role !== "admin" && u.can_view_admin;
}

export const READ_ONLY_MESSAGE =
  "You have read-only admin access, so you can view this but not change it. Ask a full admin if something needs updating.";

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

/** Require a FULL admin for a write. Read-only admins get a clear error (the UI
 *  hides write controls from them, so this only trips on a forged request). */
export async function requireWriteAdmin(): Promise<AppUser> {
  const u = await requireAdmin();
  if (!isFullAdmin(u)) throw new Error(READ_ONLY_MESSAGE);
  return u;
}

export type UniversityAccess = AppUser & {
  /** May change things on this university's board (full admin, or staff
   *  assigned to it). False for a read-only admin viewing another university. */
  canEdit: boolean;
};

/**
 * STRICT university isolation. Full admins may open and edit any university;
 * read-only admins may open any university (view only); a BOA/staff may ONLY
 * open universities they are assigned to. Others are bounced to their own
 * (or /login) — they can't even reach the page, not just see empty data.
 */
export const requireUniversityAccess = cache(async (code: string): Promise<UniversityAccess> => {
  const u = await requireAppUser();
  if (u.role === "admin") return { ...u, canEdit: true };

  const supabase = await createClient();
  // Is this staff member assigned to this university? — one round trip.
  const { data } = u.boa_id
    ? await supabase
        .from("universities")
        .select("id, code, university_boas!inner(boa_id)")
        .eq("code", code)
        .eq("university_boas.boa_id", u.boa_id)
        .maybeSingle()
    : { data: null };
  if (data) return { ...u, canEdit: true };
  if (u.can_view_admin) return { ...u, canEdit: false }; // read-only admin: view any board

  // not assigned here → send them to their own first university, else login
  const { data: mine } = await supabase
    .from("university_boas")
    .select("universities(code)")
    .limit(1);
  const myCode = (mine?.[0]?.universities as { code?: string } | null)?.code;
  redirect(myCode ? `/u/${myCode}` : "/login");
});
