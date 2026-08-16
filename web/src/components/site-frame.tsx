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

  const navClass = mobile
    ? "flex gap-1 overflow-x-auto border-t border-[var(--line)]/50 px-4 py-2.5 md:hidden"
    : "nav-rail hidden md:flex";

  return (
    <nav className={navClass}>
      {nav.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-link${mobile ? " whitespace-nowrap shrink-0" : ""}`}
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5 sm:px-8">
          <div className="flex min-w-0 items-center gap-5 sm:gap-7">
            <Link href="/dashboard" className="group flex shrink-0 items-center gap-3">
              <div className="brand-mark transition duration-300 group-hover:scale-[1.04] group-hover:shadow-lg">
                <span>{BRAND.mark}</span>
              </div>
              <div className="hidden sm:block">
                <p className="font-[family-name:var(--font-source-serif)] text-[15px] font-semibold tracking-tight text-[var(--ink)]">
                  {BRAND.name}
                </p>
                <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                  {BRAND.tagline}
                </p>
              </div>
            </Link>
            <ShellNavigation />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {userLabel && <span className="user-pill hidden lg:inline">{userLabel}</span>}
            <Link href="/articles/new" className="header-cta hidden sm:inline-flex">
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
