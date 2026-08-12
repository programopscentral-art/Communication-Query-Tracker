"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

export type NavItem = { href: string; label: string };

export function TopNav({
  items,
  email,
  roleLabel,
  home,
  backTo,
}: {
  items: NavItem[];
  email: string;
  roleLabel: string;
  home: string;
  backTo?: NavItem;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    pathname === href || (href !== home && pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          {backTo && (
            <Link
              href={backTo.href}
              className="flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-2 font-ui text-xs font-semibold text-muted transition-all hover:-translate-x-0.5 hover:border-accent hover:text-accent"
              title={`Back to ${backTo.label}`}
            >
              <span aria-hidden className="text-sm leading-none">←</span>
              {backTo.label}
            </Link>
          )}
          <Link href={home} className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/niat-shield.png" alt="NIAT" className="h-9 w-auto shrink-0" />
            <span className="font-ui text-base font-extrabold tracking-tight text-ink">PingBoard</span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`relative rounded-full px-3.5 py-2 font-ui text-sm font-medium transition-colors ${
                    active ? "text-ink" : "text-muted hover:text-ink"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="nav-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-accent-soft"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  {it.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="font-ui text-xs font-medium text-ink">{email}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted">{roleLabel}</p>
          </div>
          <button
            onClick={signOut}
            className="rounded-full border border-line px-3.5 py-2 font-ui text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
          >
            Sign out
          </button>
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line md:hidden"
            aria-label="Menu"
          >
            <span className="text-ink">≡</span>
          </button>
        </div>
      </div>

      {open && (
        <nav className="flex flex-col gap-1 border-t border-line px-4 py-3 md:hidden">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2 font-ui text-sm ${
                isActive(it.href) ? "bg-accent-soft text-ink" : "text-muted"
              }`}
            >
              {it.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
