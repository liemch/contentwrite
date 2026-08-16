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

  if (mobile) {
    return (
      <nav className="mobile-scroll-x border-t border-[var(--line)]/50 px-3 py-2 md:hidden">
        {nav.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="nav-link whitespace-nowrap"
              data-active={active}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="nav-rail hidden md:flex">
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link key={item.href} href={item.href} className="nav-link" data-active={active}>
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-8 sm:py-3.5">
          <Link href="/dashboard" className="group flex min-w-0 shrink items-center gap-2.5 sm:gap-3">
            <div className="brand-mark h-9 w-9 text-[0.72rem] transition duration-300 group-hover:scale-[1.04] sm:h-10 sm:w-10 sm:text-[0.8rem]">
              <span>{BRAND.mark}</span>
            </div>
            <div className="min-w-0 max-w-[38vw] sm:max-w-none">
              <p className="truncate font-[family-name:var(--font-source-serif)] text-sm font-semibold tracking-tight text-[var(--ink)] sm:text-[15px]">
                {BRAND.name}
              </p>
              <p className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ink-faint)] sm:block">
                {BRAND.tagline}
              </p>
            </div>
          </Link>

          <div className="hidden min-w-0 flex-1 justify-center md:flex">
            <ShellNavigation />
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {userLabel && <span className="user-pill hidden lg:inline">{userLabel}</span>}
            <Link href="/articles/new" className="header-cta px-3 py-2 text-[11px] sm:px-4 sm:text-xs">
              <span className="sm:hidden">+ Viết</span>
              <span className="hidden sm:inline">+ Bài mới</span>
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
