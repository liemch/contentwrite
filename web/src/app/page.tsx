import Link from "next/link";
import type { Metadata } from "next";
import { unstable_noStore as noStore } from "next/cache";
import { ArticleCard } from "@/components/article-card";
import { listPublishedArticles } from "@/lib/public-articles";
import { BRAND } from "@/lib/brand";
import { publicArticleHref } from "@/lib/public-routes";
import {
  PUBLISH_FORMAT_IDS,
  PUBLISH_FORMATS,
  isPublishFormatId,
} from "@/lib/tfes/publish-formats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.pitch}`,
  description: `Đọc bài đã kiểm chứng nguồn — ${BRAND.productLine}`,
};

export default async function PublicHomePage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; format?: string }>;
}) {
  noStore();
  const params = await searchParams;
  const { articles, domainFilters, countByFormat, selected } = await listPublishedArticles(params);

  const featured = articles[0];
  const rest = articles.slice(1);

  function hrefFor(domainKey: string, formatKey: string) {
    const q = new URLSearchParams();
    if (domainKey !== "all") q.set("domain", domainKey);
    if (formatKey !== "all") q.set("format", formatKey);
    const s = q.toString();
    return s ? `/?${s}` : "/";
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-3 py-6 sm:px-8 sm:py-11">
      <div className="animate-fade-up">
        <header className="mb-8 max-w-3xl sm:mb-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Tin & tri thức
          </p>
          <h1 className="mt-3 font-[family-name:var(--font-source-serif)] text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
            {BRAND.pitch}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--ink-muted)] sm:text-[15px]">
            Bài viết đã qua kiểm chứng nguồn và duyệt biên tập — đọc như tạp chí chuyên môn.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap gap-2">
          {domainFilters.map((item) => (
            <Link
              key={item.key}
              href={hrefFor(item.key, selected.format)}
              className="filter-chip"
              data-active={selected.domain === item.key}
            >
              {item.label}
              <span className="tabular-nums opacity-70">{item.count}</span>
            </Link>
          ))}
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          <Link
            href={hrefFor(selected.domain, "all")}
            className="filter-chip filter-chip-sm filter-chip-accent"
            data-active={selected.format === "all"}
          >
            Mọi format
          </Link>
          {PUBLISH_FORMAT_IDS.map((id) => (
            <Link
              key={id}
              href={hrefFor(selected.domain, id)}
              className="filter-chip filter-chip-sm filter-chip-accent"
              data-active={selected.format === id}
            >
              {PUBLISH_FORMATS[id].labelVi}
              <span className="opacity-70">{countByFormat[id] ?? 0}</span>
            </Link>
          ))}
        </div>

        {articles.length === 0 ? (
          <div className="hero-band px-6 py-16 text-center sm:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
              Chưa có bài
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
              {selected.domain === "all" && selected.format === "all"
                ? "Chưa có bài công khai"
                : "Không có bài khớp bộ lọc"}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-[var(--ink-muted)]">
              Quay lại sau — nội dung mới sẽ xuất hiện ở đây sau khi được biên tập và đăng.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {featured && (
              <ArticleCard
                {...featured}
                featured
                variant="public"
                href={publicArticleHref(featured.id)}
                formatLabel={
                  featured.publishFormat
                    ? PUBLISH_FORMATS[
                        isPublishFormatId(featured.publishFormat)
                          ? featured.publishFormat
                          : "blog"
                      ]?.labelVi
                    : undefined
                }
              />
            )}
            {rest.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((article) => (
                  <ArticleCard
                    key={article.id}
                    {...article}
                    variant="public"
                    href={publicArticleHref(article.id)}
                    formatLabel={
                      article.publishFormat
                        ? PUBLISH_FORMATS[
                            isPublishFormatId(article.publishFormat)
                              ? article.publishFormat
                              : "blog"
                          ]?.labelVi
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
