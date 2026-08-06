import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { AppShell } from "@/components/app-shell";
import { ArticleCard } from "@/components/article-card";
import { requireUserOrRedirect } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { WorkflowState } from "@/generated/prisma/client";
import { DOMAIN_IDS, DOMAIN_META, isDomainId } from "@/lib/tfes/domains";
import {
  PUBLISH_FORMAT_IDS,
  PUBLISH_FORMATS,
  isPublishFormatId,
} from "@/lib/tfes/publish-formats";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string; format?: string }>;
}) {
  noStore();
  await requireUserOrRedirect();
  const { domain, format } = await searchParams;
  const selected = isDomainId(domain) ? domain : "all";
  const selectedFormat = isPublishFormatId(format) ? format : "all";

  const where = {
    workflowState: WorkflowState.PUBLISHED,
    ...(selected !== "all" ? { domain: selected } : {}),
    ...(selectedFormat !== "all" ? { publishFormat: selectedFormat } : {}),
  };

  const [articles, domainCounts, formatCounts] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        topic: true,
        domain: true,
        status: true,
        publishFormat: true,
        seriesId: true,
        updatedAt: true,
        publishedAt: true,
        cleanPublish: true,
        heroImageUrl: true,
      },
    }),
    prisma.article.groupBy({
      by: ["domain"],
      where: { workflowState: WorkflowState.PUBLISHED },
      _count: { _all: true },
    }),
    prisma.article.groupBy({
      by: ["publishFormat"],
      where: { workflowState: WorkflowState.PUBLISHED },
      _count: { _all: true },
    }),
  ]);

  const countByDomain = Object.fromEntries(
    domainCounts.map((row) => [row.domain, row._count._all]),
  ) as Record<string, number>;
  const countByFormat = Object.fromEntries(
    formatCounts.map((row) => [row.publishFormat, row._count._all]),
  ) as Record<string, number>;
  const totalPublished = domainCounts.reduce((sum, row) => sum + row._count._all, 0);

  const featured = articles[0];
  const rest = articles.slice(1);

  const filters: Array<{ key: string; label: string; count: number }> = [
    { key: "all", label: "Tất cả", count: totalPublished },
    ...DOMAIN_IDS.map((id) => ({
      key: id,
      label: DOMAIN_META[id].short,
      count: countByDomain[id] ?? 0,
    })),
  ];

  function hrefFor(domainKey: string, formatKey: string) {
    const q = new URLSearchParams();
    if (domainKey !== "all") q.set("domain", domainKey);
    if (formatKey !== "all") q.set("format", formatKey);
    const s = q.toString();
    return s ? `/library?${s}` : "/library";
  }

  return (
    <AppShell
      title="Thư viện nội bộ"
      subtitle="Bài đã đăng — lọc theo domain / định dạng. Digest tuần từ bài điểm cao."
      actions={
        <Link
          href="/digests"
          className="rounded-full bg-[var(--accent-soft)] px-3.5 py-2 text-xs font-semibold text-[var(--accent)]"
        >
          Weekly digest →
        </Link>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((item) => (
          <Link
            key={item.key}
            href={hrefFor(item.key, selectedFormat)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
              selected === item.key
                ? "bg-[var(--ink)] text-white"
                : "bg-white/80 text-[var(--ink-muted)] ring-1 ring-[var(--line)] hover:text-[var(--ink)]"
            }`}
          >
            {item.label}
            <span
              className={`ml-1.5 tabular-nums ${
                selected === item.key ? "text-white/70" : "text-[var(--ink-faint)]"
              }`}
            >
              {item.count}
            </span>
          </Link>
        ))}
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        <Link
          href={hrefFor(selected, "all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            selectedFormat === "all"
              ? "bg-[var(--accent)] text-white"
              : "bg-white/70 text-[var(--ink-muted)] ring-1 ring-[var(--line)]"
          }`}
        >
          Mọi format
        </Link>
        {PUBLISH_FORMAT_IDS.map((id) => (
          <Link
            key={id}
            href={hrefFor(selected, id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              selectedFormat === id
                ? "bg-[var(--accent)] text-white"
                : "bg-white/70 text-[var(--ink-muted)] ring-1 ring-[var(--line)]"
            }`}
          >
            {PUBLISH_FORMATS[id].labelVi}
            <span className="ml-1 opacity-70">{countByFormat[id] ?? 0}</span>
          </Link>
        ))}
      </div>

      {articles.length === 0 ? (
        <div className="hero-band px-6 py-16 text-center sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Thư viện trống
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
            {selected === "all" && selectedFormat === "all"
              ? "Chưa có bài đã đăng"
              : "Không có bài khớp bộ lọc"}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-[var(--ink-muted)]">
            Chỉ bài trạng thái Published xuất hiện ở đây. Từ Biên tập: Chờ duyệt → Approve →
            Publish.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Về Biên tập
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {featured && (
            <ArticleCard
              {...featured}
              featured
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
    </AppShell>
  );
}
