import { ALLOWED_DOMAIN, isAllowedEmail } from "./constants";

/**
 * Why an email can't be granted admin access, in plain words — or null if it's
 * fine. Used by the Admin Access form so a mistake shows a helpful message.
 */
export function adminEmailProblem(typed: string): { title: string; detail: string } | null {
  const email = typed.trim().toLowerCase();
  if (!email) {
    return { title: "Enter an email address", detail: `Type the person's @${ALLOWED_DOMAIN} work email.` };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { title: "That doesn't look like an email address", detail: `Check for typos — it should look like name@${ALLOWED_DOMAIN}.` };
  }
  if (isAllowedEmail(email)) return null;

  const [local, domain] = email.split("@");
  // e.g. @nxtwave.in / @nxtwave.com — almost certainly meant the work domain
  if (/^nxtwave\./.test(domain)) {
    return {
      title: `Use the @${ALLOWED_DOMAIN} address`,
      detail: `“${typed.trim()}” isn't the NxtWave sign-in domain. Did you mean ${local}@${ALLOWED_DOMAIN}?`,
    };
  }
  return {
    title: "Personal emails can't be given admin access",
    detail: `“${typed.trim()}” isn't a NxtWave work account. PingBoard only lets @${ALLOWED_DOMAIN} accounts sign in, so this address could never use admin access. Enter the person's @${ALLOWED_DOMAIN} work email instead.`,
  };
}
