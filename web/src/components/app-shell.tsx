"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/logout-button";

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  showHeaderTitle?: boolean;
};

const NAV_BASE = [
  { href: "/dashboard", label: "Biên tập" },
  { href: "/library", label: "Thư viện" },
  { href: "/articles/new", label: "Viết bài" },
  { href: "/settings", label: "Cài đặt", adminOnly: true },
] as const;

export function AppShell({
  children,
  title,
  subtitle,
  backHref,
  backLabel = "Quay lại",
  actions,
  showHeaderTitle = true,
}: AppShellProps) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [userLabel, setUserLabel] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { user?: { role?: string; email?: string; name?: string | null } } | null) => {
        if (cancelled || !data?.user) return;
        setIsAdmin(data.user.role === "ADMIN");
        setUserLabel(data.user.name || data.user.email || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const nav = NAV_BASE.filter((item) => !("adminOnly" in item && item.adminOnly) || isAdmin);

  return (
    <div className="app-shell-bg min-h-screen">
      <header className="sticky top-0 z-30 border-b border-[var(--line)]/80 bg-[rgba(243,247,249,0.82)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="group flex items-center gap-3">
              <div className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-[var(--ink)] text-sm font-bold text-white shadow-md">
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(12,110,107,0.55),transparent_60%)]" />
                <span className="relative">CT</span>
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-semibold tracking-tight text-[var(--ink)]">
                  ContentTechhub
                </p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)]">
                  AI-TFES Editorial
                </p>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 md:flex">
              {nav.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="nav-link"
                    data-active={active}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            {userLabel && (
              <span className="hidden max-w-[140px] truncate text-xs text-[var(--ink-faint)] lg:inline">
                {userLabel}
              </span>
            )}
            <Link
              href="/articles/new"
              className="hidden rounded-full bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--accent-hover)] sm:inline-flex"
            >
              + Bài mới
            </Link>
            <LogoutButton />
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto border-t border-[var(--line)]/70 px-4 py-2 md:hidden">
          {nav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className="nav-link whitespace-nowrap" data-active={active}>
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="animate-fade-up">
          {backHref && (
            <Link
              href={backHref}
              className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--ink-muted)] transition hover:text-[var(--accent)]"
            >
              <span aria-hidden>←</span> {backLabel}
            </Link>
          )}

          {showHeaderTitle && title && (
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-3xl">
                <h1 className="font-[family-name:var(--font-source-serif)] text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-[2.5rem] sm:leading-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--ink-muted)] sm:text-[15px]">
                    {subtitle}
                  </p>
                )}
              </div>
              {actions}
            </div>
          )}

          {children}
        </div>
      </main>
    </div>
  );
}
