import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { AppShell } from "@/components/app-shell";
import { ArticleCard } from "@/components/article-card";
import { prisma } from "@/lib/db";
import { DOMAIN_IDS, DOMAIN_META, isDomainId } from "@/lib/tfes/domains";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  noStore();
  const { domain } = await searchParams;
  const selected = isDomainId(domain) ? domain : "all";

  const [articles, domainCounts] = await Promise.all([
    prisma.article.findMany({
      where: {
        status: "PUBLISHED",
        ...(selected !== "all" ? { domain: selected } : {}),
      },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        title: true,
        topic: true,
        domain: true,
        status: true,
        updatedAt: true,
        publishedAt: true,
        cleanPublish: true,
        heroImageUrl: true,
      },
    }),
    prisma.article.groupBy({
      by: ["domain"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    }),
  ]);

  const countByDomain = Object.fromEntries(
    domainCounts.map((row) => [row.domain, row._count._all]),
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

  return (
    <AppShell
      title="Thư viện nội bộ"
      subtitle="Chỉ bài đã đăng (Published) — đọc lại, chia sẻ nội bộ, lọc theo danh mục."
    >
      <div className="mb-8 flex flex-wrap gap-2">
        {filters.map((item) => (
          <Link
            key={item.key}
            href={item.key === "all" ? "/library" : `/library?domain=${item.key}`}
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

      {articles.length === 0 ? (
        <div className="hero-band px-6 py-16 text-center sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Thư viện trống
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
            {selected === "all" ? "Chưa có bài đã đăng" : "Chưa có bài trong danh mục này"}
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
          {featured && <ArticleCard {...featured} featured />}
          {rest.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((article) => (
                <ArticleCard key={article.id} {...article} />
              ))}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
