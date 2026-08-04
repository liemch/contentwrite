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

          {showTitle && (
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
  );
}
