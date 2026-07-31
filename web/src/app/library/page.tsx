import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { AppShell } from "@/components/app-shell";
import { ArticleCard } from "@/components/article-card";
import { prisma } from "@/lib/db";
import { DOMAIN_META, isDomainId } from "@/lib/tfes/domains";

export const dynamic = "force-dynamic";

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ domain?: string }>;
}) {
  noStore();
  const { domain } = await searchParams;
  const selected = isDomainId(domain) ? domain : "all";

  const articles = await prisma.article.findMany({
    where: {
      status: { in: ["PUBLISHED", "APPROVED"] },
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
  });

  const featured = articles[0];
  const rest = articles.slice(1);

  const filters: Array<{ key: string; label: string }> = [
    { key: "all", label: "Tất cả" },
    ...Object.values(DOMAIN_META).map((d) => ({ key: d.id, label: d.short })),
  ];

  return (
    <AppShell
      title="Thư viện nội bộ"
      subtitle="Các bài đã duyệt / publish — đọc lại, chia sẻ nội bộ, đối chiếu Knowledge Base."
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
          </Link>
        ))}
      </div>

      {articles.length === 0 ? (
        <div className="hero-band px-6 py-16 text-center sm:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Thư viện trống
          </p>
          <h2 className="mt-3 font-[family-name:var(--font-source-serif)] text-2xl font-semibold">
            Chưa có bài đã duyệt
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-[var(--ink-muted)]">
            Chạy chu trình đến Chờ duyệt → Approve / Publish. Bài sẽ xuất hiện ở đây để đọc gọn
            như tạp chí nội bộ.
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
