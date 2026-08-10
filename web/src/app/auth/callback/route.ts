import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAllowedEmail } from "@/lib/constants";

/**
 * OAuth callback. Exchanges the code for a session, then enforces the domain
 * lock at the session layer: a non-@nxtwave.co.in user is immediately signed
 * out and sent to /blocked (belt-and-suspenders with the DB trigger).
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/blocked?reason=no_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/blocked?reason=exchange_failed`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isAllowedEmail(user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/blocked?reason=domain`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
