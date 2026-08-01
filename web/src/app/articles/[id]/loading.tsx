export default function ArticleLoading() {
  return (
    <div className="app-shell-bg min-h-screen">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="mb-6 h-4 w-32 animate-pulse-soft rounded bg-white/70" />
        <div className="mb-8 h-12 w-2/3 max-w-lg animate-pulse-soft rounded-xl bg-white/80" />
        <div className="mb-6 h-24 animate-pulse-soft rounded-2xl bg-white/70" />
        <div className="surface-card h-80 animate-pulse-soft" />
        <p className="mt-6 text-center text-sm text-[var(--ink-faint)]">Đang tải bài…</p>
      </div>
    </div>
  );
}
