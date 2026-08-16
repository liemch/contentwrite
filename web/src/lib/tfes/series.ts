import { sanitizeSeriesArticleForUser, ownedResourceWhere } from "@/lib/access";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export function slugifySeriesTitle(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return base || `series-${Date.now().toString(36)}`;
}

export async function uniqueSeriesSlug(title: string): Promise<string> {
  const base = slugifySeriesTitle(title);
  let slug = base;
  let n = 0;
  while (await prisma.series.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

export async function listSeries(domain: string | null | undefined, user: SessionUser) {
  const rows = await prisma.series.findMany({
    where: {
      ...ownedResourceWhere(user),
      ...(domain ? { domain } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { articles: true } },
      articles: {
        orderBy: [{ seriesOrder: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          title: true,
          topic: true,
          status: true,
          workflowState: true,
          seriesOrder: true,
          publishFormat: true,
          publishedAt: true,
          createdById: true,
          updatedAt: true,
        },
        take: 8,
      },
    },
  });

  return rows.map((series) => ({
    ...series,
    articles: series.articles.map((article) =>
      sanitizeSeriesArticleForUser(user, {
        ...article,
        domain: series.domain,
        cleanPublish: null,
      }),
    ),
  }));
}
