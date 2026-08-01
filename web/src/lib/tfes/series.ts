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

export async function listSeries(domain?: string | null) {
  return prisma.series.findMany({
    where: domain ? { domain } : undefined,
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
          seriesOrder: true,
          publishFormat: true,
          publishedAt: true,
        },
        take: 8,
      },
    },
  });
}
