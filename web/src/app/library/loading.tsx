export default function LibraryLoading() {
  return (
    <div className="app-shell-bg min-h-screen">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="mb-8 h-16 w-2/3 max-w-md animate-pulse-soft rounded-xl bg-white/70" />
        <div className="mb-8 flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-9 w-24 animate-pulse-soft rounded-full bg-white/80" />
          ))}
        </div>
        <div className="hero-band mb-6 h-56 animate-pulse-soft" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="surface-soft h-44 animate-pulse-soft" />
          ))}
        </div>
        <p className="mt-6 text-center text-sm text-[var(--ink-faint)]">Đang tải thư viện…</p>
      </div>
    </div>
  );
}
