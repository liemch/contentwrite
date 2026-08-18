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
    <main className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-8 sm:py-11">
      <div className="animate-fade-up">
        {backHref && (
          <Link
            href={backHref}
            className="mb-5 inline-flex items-center gap-2 rounded-full border border-transparent px-2 py-1 text-sm font-medium text-[var(--ink-muted)] transition hover:border-[var(--line)] hover:bg-white/70 hover:text-[var(--accent)]"
          >
            <span aria-hidden className="text-base leading-none">
              ←
            </span>
            {backLabel}
          </Link>
        )}

        {showTitle && (
          <div className="mb-7 flex flex-col gap-4 sm:mb-9 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="min-w-0 max-w-3xl">
              <h1 className="page-title break-words">{title}</h1>
              {subtitle && (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ink-muted)] sm:mt-3 sm:text-[15px]">
                  {subtitle}
                </p>
              )}
            </div>
            {actions ? <div className="flex w-full min-w-0 flex-wrap gap-2 sm:w-auto">{actions}</div> : null}
          </div>
        )}

        {children}
      </div>
    </main>
  );
}
