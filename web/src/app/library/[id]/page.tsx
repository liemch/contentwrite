import Link from "next/link";
import { notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { AppShell } from "@/components/app-shell";
import { MarkdownView } from "@/components/markdown-view";
import { DomainBadge, StatusBadge } from "@/components/status-badge";
import { readingMinutes } from "@/lib/excerpt";
import { requireUserOrRedirect } from "@/lib/auth-guard";
import { prepareReaderContent } from "@/lib/publish-content";
import { prisma } from "@/lib/db";
import { WorkflowState } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function LibraryArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  noStore();
  await requireUserOrRedirect();
  const { id } = await params;
  const article = await prisma.article.findUnique({ where: { id } });

  if (!article || article.workflowState !== WorkflowState.PUBLISHED) {
    notFound();
  }

  const raw = article.cleanPublish || "Chưa có bản sạch.";
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
    <AppShell showHeaderTitle={false} backHref="/library" backLabel="Thư viện">
      <article className="mx-auto max-w-3xl">
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={article.status} />
            <DomainBadge domain={article.domain} />
            <span className="text-xs text-[var(--ink-faint)]">{minutes} phút đọc</span>
          </div>
          <h1 className="mt-4 font-[family-name:var(--font-source-serif)] text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl sm:leading-tight">
            {article.title || article.topic || "Không tiêu đề"}
          </h1>
          <p className="mt-3 text-sm text-[var(--ink-muted)]">
            {date}
            {article.topic ? ` · Gốc chủ đề: ${article.topic}` : ""}
          </p>
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

        {article.heroBrief && (
          <details className="mt-6 surface-soft p-5">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">
              Hero Image Brief (để gen ảnh)
            </summary>
            <pre className="mt-3 whitespace-pre-wrap font-mono text-xs leading-relaxed text-[var(--ink-muted)]">
              {article.heroBrief}
            </pre>
          </details>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/articles/${article.id}`}
            className="rounded-full border border-[var(--line-strong)] bg-white px-4 py-2 text-sm font-medium text-[var(--ink)]"
          >
            Mở workspace biên tập
          </Link>
          <Link
            href="/library"
            className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-medium text-[var(--accent)]"
          >
            ← Thư viện
          </Link>
        </div>
      </article>
    </AppShell>
  );
}
