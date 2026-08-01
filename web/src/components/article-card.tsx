import Link from "next/link";
import { DomainBadge, StatusBadge } from "@/components/status-badge";
import { excerptFromMarkdown, readingMinutes } from "@/lib/excerpt";

type ArticleCardProps = {
  id: string;
  title: string | null;
  topic: string | null;
  domain: string;
  status: string;
  updatedAt: Date | string;
  cleanPublish?: string | null;
  publishedAt?: Date | string | null;
  heroImageUrl?: string | null;
  source?: string | null;
  href?: string;
  featured?: boolean;
  formatLabel?: string | null;
};

export function ArticleCard({
  id,
  title,
  topic,
  domain,
  status,
  updatedAt,
  cleanPublish,
  publishedAt,
  heroImageUrl,
  source,
  href,
  featured = false,
  formatLabel,
}: ArticleCardProps) {
  const displayTitle = title || topic || "Bài chưa có tiêu đề";
  const excerpt = excerptFromMarkdown(cleanPublish, featured ? 220 : 140);
  const minutes = readingMinutes(cleanPublish);
  const date = new Date(publishedAt || updatedAt).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const link = href ?? (status === "PUBLISHED" ? `/library/${id}` : `/articles/${id}`);

  if (featured) {
    return (
      <Link href={link} className="group hero-band block overflow-hidden transition hover:-translate-y-0.5">
        {heroImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImageUrl} alt="" className="h-52 w-full object-cover sm:h-64" />
        )}
        <div className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <DomainBadge domain={domain} />
            {formatLabel && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                {formatLabel}
              </span>
            )}
            {source === "auto" && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                Auto
              </span>
            )}
            <span className="text-xs text-[var(--ink-faint)]">{minutes} phút đọc</span>
          </div>
          <h3 className="mt-4 font-[family-name:var(--font-source-serif)] text-2xl font-semibold tracking-tight text-[var(--ink)] transition group-hover:text-[var(--accent)] sm:text-3xl">
            {displayTitle}
          </h3>
          {excerpt && (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--ink-muted)] sm:text-[15px]">
              {excerpt}
            </p>
          )}
          <p className="mt-5 text-xs font-medium uppercase tracking-[0.12em] text-[var(--ink-faint)]">
            {date} · Đọc bài →
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={link}
      className="group surface-soft block overflow-hidden transition hover:-translate-y-0.5 hover:border-[var(--accent)]/30 hover:shadow-[var(--shadow)]"
    >
      {heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={heroImageUrl} alt="" className="h-36 w-full object-cover" />
      )}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <DomainBadge domain={domain} />
            {formatLabel && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                {formatLabel}
              </span>
            )}
            {source === "auto" && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                Auto
              </span>
            )}
          </div>
          <StatusBadge status={status} />
        </div>
        <h3 className="mt-3 line-clamp-2 font-[family-name:var(--font-source-serif)] text-lg font-semibold tracking-tight text-[var(--ink)] transition group-hover:text-[var(--accent)]">
          {displayTitle}
        </h3>
        {excerpt ? (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--ink-muted)]">{excerpt}</p>
        ) : (
          <p className="mt-2 text-sm text-[var(--ink-faint)]">Chưa có bản sạch để xem trước.</p>
        )}
        <div className="mt-4 flex items-center justify-between text-xs text-[var(--ink-faint)]">
          <span>{date}</span>
          {cleanPublish ? <span>{minutes} phút</span> : null}
        </div>
      </div>
    </Link>
  );
}
