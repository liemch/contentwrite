"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useShellSession } from "@/components/session-provider";
import { BRAND } from "@/lib/brand";

function EditorialAccessButton({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const { user, ready } = useShellSession();
  const loginHref =
    pathname.startsWith("/bai/") ? `/login?next=${encodeURIComponent(pathname)}` : "/login?next=/dashboard";

  if (ready && user) {
    return (
      <Link
        href="/dashboard"
        className={`header-cta ${compact ? "px-3 py-2 text-[11px] sm:px-4 sm:text-xs" : "px-5 py-2.5 text-xs sm:text-sm"}`}
      >
        Vào biên tập
      </Link>
    );
  }

  return (
    <Link
      href={loginHref}
      className={`header-cta ${compact ? "px-3 py-2 text-[11px] sm:px-4 sm:text-xs" : "px-5 py-2.5 text-xs sm:text-sm"}`}
    >
      Đăng nhập biên tập
    </Link>
  );
}

export function PublicSiteFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="app-shell-bg min-h-screen">
      <header className="site-header sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-4 sm:px-8 sm:py-3.5">
          <Link href="/" className="group flex min-w-0 shrink items-center gap-2.5 sm:gap-3">
            <div className="brand-mark h-9 w-9 text-[0.72rem] transition duration-300 group-hover:scale-[1.04] sm:h-10 sm:w-10 sm:text-[0.8rem]">
              <span>{BRAND.mark}</span>
            </div>
            <div className="min-w-0 max-w-[38vw] sm:max-w-none">
              <p className="truncate font-[family-name:var(--font-source-serif)] text-sm font-semibold tracking-tight text-[var(--ink)] sm:text-[15px]">
                {BRAND.name}
              </p>
              <p className="hidden text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ink-faint)] sm:block">
                {BRAND.pitch}
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <Link href="/" className="nav-link" data-active={pathname === "/"}>
              Trang chủ
            </Link>
          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <EditorialAccessButton compact />
          </div>
        </div>
      </header>
      {children}
      <footer className="border-t border-[var(--line)]/60 bg-white/40">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-8 text-sm text-[var(--ink-muted)] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            © {new Date().getFullYear()} {BRAND.name} · {BRAND.pitch}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <EditorialAccessButton compact />
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-faint)]">
              {BRAND.productLine}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
