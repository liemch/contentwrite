import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { MarkdownView } from "@/components/markdown-view";
import { DomainBadge } from "@/components/status-badge";
import { getSession } from "@/lib/auth";
import { readingMinutes } from "@/lib/excerpt";
import { getPublishedArticleById } from "@/lib/public-articles";
import { prepareReaderContent } from "@/lib/publish-content";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const article = await getPublishedArticleById(id);
  if (!article) return { title: "Không tìm thấy bài" };
  return {
    title: article.title || article.topic || "Bài viết",
    description: article.topic || undefined,
  };
}

export default async function PublicArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  const { id } = await params;
  const [article, session] = await Promise.all([getPublishedArticleById(id), getSession()]);

  if (!article) notFound();

  const raw = article.cleanPublish || "Chưa có nội dung.";
  const content = prepareReaderContent(raw, {
    stripLeadingHeroImage: Boolean(article.heroImageUrl),
    stripHeroBriefSection: true,
  });
  const minutes = readingMinutes(article.cleanPublish);
  const date = new Date(article.publishedAt || article.updatedAt).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-8 sm:py-11">
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-2 rounded-full border border-transparent px-2 py-1 text-sm font-medium text-[var(--ink-muted)] transition hover:border-[var(--line)] hover:bg-white/70 hover:text-[var(--accent)]"
      >
        <span aria-hidden className="text-base leading-none">
          ←
        </span>
        Trang chủ
      </Link>

      <article className="animate-fade-up">
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <DomainBadge domain={article.domain} />
            <span className="text-xs text-[var(--ink-faint)]">{minutes} phút đọc</span>
          </div>
          <h1 className="mt-4 font-[family-name:var(--font-source-serif)] text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl sm:leading-tight">
            {article.title || article.topic || "Không tiêu đề"}
          </h1>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">{date}</p>
        </header>

        <div className="surface-card p-6 sm:p-10">
          {article.heroImageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.heroImageUrl}
              alt={article.heroImageAlt || article.title || "Hero"}
              className="mb-8 w-full rounded-2xl object-cover"
            />
          )}
          <MarkdownView content={content} />
        </div>

        {session && (
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href={`/articles/${article.id}`}
              className="rounded-full border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]"
            >
              Mở workspace biên tập
            </Link>
            <Link
              href={`/library/${article.id}`}
              className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)]"
            >
              Thư viện nội bộ
            </Link>
          </div>
        )}
      </article>
    </main>
  );
}
