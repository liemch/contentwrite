import { prisma } from "@/lib/db";
import { WorkflowState } from "@/generated/prisma/client";
import { DOMAIN_IDS, DOMAIN_META, isDomainId } from "@/lib/tfes/domains";
import { isPublishFormatId } from "@/lib/tfes/publish-formats";

export const publishedArticleSelect = {
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
} as const;

export type PublishedArticleListItem = {
  id: string;
  title: string | null;
  topic: string | null;
  domain: string;
  status: string;
  publishFormat: string;
  seriesId: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
  cleanPublish: string | null;
  heroImageUrl: string | null;
};

export type PublishedArticleFilters = {
  domain?: string;
  format?: string;
};

export function normalizePublishedFilters(filters: PublishedArticleFilters = {}) {
  const domain = isDomainId(filters.domain) ? filters.domain : "all";
  const format = isPublishFormatId(filters.format) ? filters.format : "all";
  return { domain, format };
}

export function buildPublishedWhere(filters: PublishedArticleFilters = {}) {
  const { domain, format } = normalizePublishedFilters(filters);
  return {
    workflowState: WorkflowState.PUBLISHED,
    ...(domain !== "all" ? { domain } : {}),
    ...(format !== "all" ? { publishFormat: format } : {}),
  };
}

export async function listPublishedArticles(filters: PublishedArticleFilters = {}) {
  const where = buildPublishedWhere(filters);

  const [articles, domainCounts, formatCounts] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      select: publishedArticleSelect,
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

  const domainFilters = [
    { key: "all", label: "Tất cả", count: totalPublished },
    ...DOMAIN_IDS.map((id) => ({
      key: id,
      label: DOMAIN_META[id].short,
      count: countByDomain[id] ?? 0,
    })),
  ];

  return {
    articles: articles as PublishedArticleListItem[],
    countByDomain,
    countByFormat,
    totalPublished,
    domainFilters,
    selected: normalizePublishedFilters(filters),
  };
}

export async function getPublishedArticleById(id: string) {
  const article = await prisma.article.findUnique({ where: { id } });
  if (!article || article.workflowState !== WorkflowState.PUBLISHED) return null;
  return article;
}
