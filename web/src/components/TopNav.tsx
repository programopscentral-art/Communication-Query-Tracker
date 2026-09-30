"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";

export type NavItem = { href: string; label: string };

// Responsive header:
//  • ≥1280px (xl): full link bar + account menu
//  • <1280px:      logo + account menu + ☰ menu with every link
// The account menu (email, role, sign out) keeps the bar from overflowing.
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
  const [open, setOpen] = useState(false); // nav menu (small screens)
  const [acct, setAcct] = useState(false); // account menu
  const acctRef = useRef<HTMLDivElement>(null);

  // close menus on navigation
  useEffect(() => {
    setOpen(false);
    setAcct(false);
  }, [pathname]);

  // close the account menu on outside click / Escape
  useEffect(() => {
    if (!acct) return;
    const onDown = (e: MouseEvent) => {
      if (acctRef.current && !acctRef.current.contains(e.target as Node)) setAcct(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAcct(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [acct]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    pathname === href || (href !== home && pathname.startsWith(href));
  const initial = (email[0] ?? "?").toUpperCase();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3 xl:gap-5">
          {backTo && (
            <Link
              href={backTo.href}
              className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-2 font-ui text-xs font-semibold text-muted transition-all hover:-translate-x-0.5 hover:border-accent hover:text-accent"
              title={`Back to ${backTo.label}`}
            >
              <span aria-hidden className="text-sm leading-none">←</span>
              <span className="hidden sm:inline">{backTo.label}</span>
            </Link>
          )}
          <Link href={home} className="flex shrink-0 items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/niat-shield.png" alt="NIAT" className="h-9 w-auto shrink-0" />
            <span className="font-ui text-base font-extrabold tracking-tight text-ink">PingBoard</span>
          </Link>

          <nav className="hidden items-center gap-0.5 xl:flex">
            {items.map((it) => {
              const active = isActive(it.href);
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`relative whitespace-nowrap rounded-full px-2.5 py-2 font-ui text-sm font-medium transition-colors ${
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

        <div className="flex shrink-0 items-center gap-2">
          {/* account menu */}
          <div ref={acctRef} className="relative">
            <button
              onClick={() => setAcct((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={acct}
              className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-2.5 transition-colors hover:border-accent"
              title={email}
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-accent font-ui text-xs font-bold text-white">
                {initial}
              </span>
              <span className="hidden max-w-[10rem] truncate font-ui text-xs font-semibold text-ink sm:block">{roleLabel}</span>
              <span aria-hidden className="text-[10px] text-muted">▾</span>
            </button>
            {acct && (
              <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-2 shadow-[var(--shadow-card)]">
                <div className="px-3 py-2">
                  <p className="font-ui text-sm font-semibold text-ink [overflow-wrap:anywhere]">{email}</p>
                  <p className="mt-0.5 text-[11px] uppercase tracking-wider text-muted">{roleLabel}</p>
                </div>
                <button
                  role="menuitem"
                  onClick={signOut}
                  className="mt-1 w-full rounded-xl px-3 py-2 text-left font-ui text-sm font-semibold text-danger transition-colors hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>

          {/* nav menu toggle (below xl) */}
          <button
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line xl:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            <span className="text-lg leading-none text-ink">{open ? "✕" : "≡"}</span>
          </button>
        </div>
      </div>

      {open && (
        <nav className="grid max-h-[calc(100vh-4rem)] grid-cols-2 gap-1 overflow-y-auto border-t border-line px-4 py-3 sm:grid-cols-3 md:grid-cols-4 xl:hidden">
          {items.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              onClick={() => setOpen(false)}
              className={`rounded-lg px-3 py-2.5 font-ui text-sm ${
                isActive(it.href) ? "bg-accent-soft font-semibold text-ink" : "text-muted hover:bg-canvas hover:text-ink"
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
