export default function DashboardLoading() {
  return (
    <div className="app-shell-bg min-h-screen">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="desk-hero relative mb-8 h-40 animate-pulse-soft px-6 py-8 sm:px-10" />
        <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="metric-tile h-28 animate-pulse-soft px-4 py-4" />
          ))}
        </div>
        <div className="surface-card h-48 animate-pulse-soft" />
        <p className="mt-6 text-center text-sm text-[var(--ink-faint)]">Đang tải bàn biên tập…</p>
      </div>
    </div>
  );
}
