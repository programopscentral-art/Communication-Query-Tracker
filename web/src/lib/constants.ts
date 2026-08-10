/**
 * The ONLY email domain allowed to access this workspace.
 * Enforced in three layers: Google OAuth hint (UX), the auth callback + middleware
 * (session), and a Postgres trigger on auth.users (hard block at signup).
 */
export const ALLOWED_DOMAIN = "nxtwave.co.in";

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.toLowerCase().trim().endsWith(`@${ALLOWED_DOMAIN}`);
}
