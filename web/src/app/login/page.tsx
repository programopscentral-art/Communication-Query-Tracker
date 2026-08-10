import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_DOMAIN, isAllowedEmail } from "@/lib/constants";
import GoogleButton from "./GoogleButton";
import { Reveal } from "@/components/ui/Reveal";

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && isAllowedEmail(user.email)) redirect("/");

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="grid-bg absolute inset-0" />
      <div className="accent-glow" />

      <Reveal className="relative w-full max-w-sm">
        <div className="card p-8">
          <div className="mb-7 text-center">
            <span className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-ink font-ui text-lg font-bold text-white">
              C<span className="text-accent">T</span>
            </span>
            <p className="eyebrow mb-2">Communication Query Tracker</p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-muted">
              Sign in with your NxtWave account to continue.
            </p>
          </div>

          <GoogleButton />

          <div className="mt-6 rounded-xl border border-line bg-canvas p-3">
            <p className="text-center text-xs leading-relaxed text-muted">
              Only{" "}
              <span className="font-ui font-semibold text-ink">@{ALLOWED_DOMAIN}</span>{" "}
              accounts can access this workspace. Access outside the domain is
              blocked automatically.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center font-ui text-xs text-muted">
          Enterprise logic. <span className="text-accent">BOA speed.</span>
        </p>
      </Reveal>
    </main>
  );
}
