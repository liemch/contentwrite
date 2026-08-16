import Link from "next/link";

type AppShellProps = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  showHeaderTitle?: boolean;
  /** Dashboard tự render welcome — ẩn title mặc định */
  hidePageChrome?: boolean;
};

export function AppShell({
  children,
  title,
  subtitle,
  backHref,
  backLabel = "Quay lại",
  actions,
  showHeaderTitle = true,
  hidePageChrome = false,
}: AppShellProps) {
  const showTitle = showHeaderTitle && title && !hidePageChrome;

  return (
    <main className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-11">
      <div className="animate-fade-up">
        {backHref && (
          <Link
            href={backHref}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-transparent px-2 py-1 text-sm font-medium text-[var(--ink-muted)] transition hover:border-[var(--line)] hover:bg-white/70 hover:text-[var(--accent)]"
          >
            <span aria-hidden className="text-base leading-none">
              ←
            </span>
            {backLabel}
          </Link>
        )}

        {showTitle && (
          <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-3xl">
              <h1 className="page-title">{title}</h1>
              {subtitle && (
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)] sm:text-[15px]">
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
  );
}
