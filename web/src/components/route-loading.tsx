export function RouteLoading({ variant = "cards" }: { variant?: "cards" | "editor" | "settings" }) {
  return (
    <main
      className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 sm:py-10"
      aria-busy="true"
      aria-label="Đang tải nội dung"
    >
        <div className="skeleton-shimmer mb-3 h-4 w-24 rounded" />
        <div className="skeleton-shimmer mb-8 h-10 w-2/3 max-w-lg rounded-xl" />
        {variant === "editor" ? (
          <><div className="skeleton-shimmer mb-5 h-24 rounded-2xl" /><div className="skeleton-shimmer h-80 rounded-2xl" /></>
        ) : variant === "settings" ? (
          <div className="grid gap-5 lg:grid-cols-2"><div className="skeleton-shimmer h-72 rounded-2xl" /><div className="skeleton-shimmer h-72 rounded-2xl" /><div className="skeleton-shimmer h-96 rounded-2xl lg:col-span-2" /></div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="skeleton-shimmer h-40 rounded-2xl" />)}</div>
        )}
      </main>
  );
}
