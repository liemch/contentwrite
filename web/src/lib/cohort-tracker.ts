import { prisma } from "@/lib/db";
import { detectReaderMetaLeak } from "@/lib/publish-content";

export const COHORT_DOC_PATH = "_ops/cohort-manifest.json";

export type CohortManifest = {
  cohortId: string;
  protocolVersion: string;
  aiTfesVersion?: string;
  startedAt?: string;
  frozenUntil?: string;
  notes?: string;
  targets?: {
    minArticles?: number;
    minDomains?: number;
    minFeedbackResponses?: number;
    maxMetaLeakRate?: number;
  };
  articleIds: string[];
};

export const DEFAULT_COHORT_MANIFEST: CohortManifest = {
  cohortId: "wp27-quality",
  protocolVersion: "wp2.7-v1",
  aiTfesVersion: "v2-rc2",
  articleIds: [],
  targets: {
    minArticles: 10,
    minDomains: 2,
    minFeedbackResponses: 8,
    maxMetaLeakRate: 0,
  },
};

export async function loadCohortManifest(): Promise<CohortManifest> {
  try {
    const row = await prisma.tfesDocument.findUnique({ where: { path: COHORT_DOC_PATH } });
    if (!row?.content) return { ...DEFAULT_COHORT_MANIFEST };
    const parsed = JSON.parse(row.content) as CohortManifest;
    return {
      ...DEFAULT_COHORT_MANIFEST,
      ...parsed,
      articleIds: Array.isArray(parsed.articleIds)
        ? [...new Set(parsed.articleIds.filter((id) => typeof id === "string" && id.trim()))]
        : [],
    };
  } catch {
    return { ...DEFAULT_COHORT_MANIFEST };
  }
}

export async function saveCohortManifest(
  manifest: CohortManifest,
  updatedBy: string,
): Promise<CohortManifest> {
  const normalized: CohortManifest = {
    ...DEFAULT_COHORT_MANIFEST,
    ...manifest,
    articleIds: [...new Set(manifest.articleIds.filter((id) => id.trim()))],
  };
  await prisma.tfesDocument.upsert({
    where: { path: COHORT_DOC_PATH },
    create: {
      path: COHORT_DOC_PATH,
      content: JSON.stringify(normalized, null, 2),
      updatedBy,
    },
    update: {
      content: JSON.stringify(normalized, null, 2),
      updatedBy,
    },
  });
  return normalized;
}

export type CohortArticleStat = {
  id: string;
  title: string | null;
  topic: string | null;
  domain: string;
  workflowState: string;
  publishedAt: Date | null;
  metaLeak: boolean;
};

export type CohortStats = {
  manifest: CohortManifest;
  articles: CohortArticleStat[];
  summary: {
    total: number;
    published: number;
    domains: number;
    metaLeakCount: number;
    metaLeakRate: number;
    targetMinArticles: number;
    onTrack: boolean;
  };
};

export async function computeCohortStats(manifest: CohortManifest): Promise<CohortStats> {
  const ids = manifest.articleIds;
  const articles =
    ids.length === 0
      ? []
      : await prisma.article.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            title: true,
            topic: true,
            domain: true,
            workflowState: true,
            publishedAt: true,
            cleanPublish: true,
          },
        });

  const rows: CohortArticleStat[] = articles.map((article) => ({
    id: article.id,
    title: article.title,
    topic: article.topic,
    domain: article.domain,
    workflowState: article.workflowState,
    publishedAt: article.publishedAt,
    metaLeak: detectReaderMetaLeak(article.cleanPublish ?? "").length > 0,
  }));

  const published = rows.filter((row) => row.workflowState === "PUBLISHED").length;
  const domains = new Set(rows.map((row) => row.domain)).size;
  const metaLeakCount = rows.filter((row) => row.metaLeak).length;
  const metaLeakRate = rows.length > 0 ? metaLeakCount / rows.length : 0;
  const targetMinArticles = manifest.targets?.minArticles ?? 10;

  return {
    manifest,
    articles: rows,
    summary: {
      total: rows.length,
      published,
      domains,
      metaLeakCount,
      metaLeakRate,
      targetMinArticles,
      onTrack: rows.length >= targetMinArticles && metaLeakRate <= (manifest.targets?.maxMetaLeakRate ?? 0),
    },
  };
}
