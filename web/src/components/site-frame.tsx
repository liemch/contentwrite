"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/logout-button";
import { useShellSession } from "@/components/session-provider";
import { BRAND } from "@/lib/brand";

const NAV_BASE = [
  { href: "/dashboard", label: "Biên tập" },
  { href: "/library", label: "Thư viện" },
  { href: "/series", label: "Series" },
  { href: "/digests", label: "Digest" },
  { href: "/articles/new", label: "Viết bài" },
  { href: "/settings", label: "Cài đặt", adminOnly: true },
] as const;

function ShellNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const { user } = useShellSession();
  const nav = NAV_BASE.filter(
    (item) => !("adminOnly" in item && item.adminOnly) || user?.role === "ADMIN",
  );

  return (
    <nav
      className={
        mobile
          ? "flex gap-1 overflow-x-auto border-t border-[var(--line)]/60 px-4 py-2 md:hidden"
          : "hidden items-center gap-0.5 md:flex"
      }
    >
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${mobile ? " whitespace-nowrap" : ""}`}
            data-active={active}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user } = useShellSession();

  if (pathname === "/login" || pathname === "/") return children;

  const userLabel = user?.name || user?.email || "";
  return (
    <div className="app-shell-bg min-h-screen">
      <header className="site-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="group flex items-center gap-3">
              <div className="brand-mark transition group-hover:scale-[1.03]">
                <span>{BRAND.mark}</span>
              </div>
              <div className="hidden sm:block">
                <p className="font-[family-name:var(--font-source-serif)] text-[15px] font-semibold tracking-tight text-[var(--ink)]">
                  {BRAND.name}
                </p>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                  {BRAND.tagline}
                </p>
              </div>
            </Link>
            <ShellNavigation />
          </div>

          <div className="flex items-center gap-2.5">
            {userLabel && (
              <span className="hidden max-w-[160px] truncate rounded-full bg-white/70 px-3 py-1.5 text-xs text-[var(--ink-muted)] ring-1 ring-[var(--line)] lg:inline">
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
        <ShellNavigation mobile />
      </header>
      {children}
    </div>
  );
}
