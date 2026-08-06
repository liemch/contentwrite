import { UserRole, WorkflowState, type Article } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AuthError, type SessionUser } from "@/lib/auth";

const QUOTA_TZ = "Asia/Ho_Chi_Minh";

export function isAdmin(user: SessionUser): boolean {
  return user.role === UserRole.ADMIN;
}

/** Editor: chỉ bài của mình. Admin: mọi bài (kể cả legacy null). */
export function canAccessArticle(
  user: SessionUser,
  article: { createdById?: string | null },
): boolean {
  if (isAdmin(user)) return true;
  return Boolean(article.createdById && article.createdById === user.userId);
}

export function assertCanAccessArticle(
  user: SessionUser,
  article: { createdById?: string | null },
): void {
  if (!canAccessArticle(user, article)) {
    throw new AuthError("Không có quyền với bài này", 403);
  }
}

/** Khoảng [start, end) của “hôm nay” theo Asia/Ho_Chi_Minh */
export function vietnamDayBounds(now = new Date()): { start: Date; end: Date } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: QUOTA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const day = fmt.format(now); // YYYY-MM-DD
  // 00:00 VN = UTC+7 → start UTC = day 17:00 previous calendar in UTC... use offset trick:
  // Construct as ISO with +07:00
  const start = new Date(`${day}T00:00:00+07:00`);
  const end = new Date(`${day}T24:00:00+07:00`);
  return { start, end };
}

export async function countArticlesCreatedToday(userId: string): Promise<number> {
  const { start, end } = vietnamDayBounds();
  return prisma.article.count({
    where: {
      createdById: userId,
      createdAt: { gte: start, lt: end },
      source: "manual",
    },
  });
}

export type QuotaInfo = {
  limit: number;
  used: number;
  remaining: number;
};

export async function getQuotaInfo(user: SessionUser): Promise<QuotaInfo> {
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.userId } });
  const limit = dbUser.dailyArticleLimit;
  const used = await countArticlesCreatedToday(user.userId);
  const remaining = Math.max(0, limit - used);
  return { limit, used, remaining };
}

export async function assertCanCreateArticle(user: SessionUser): Promise<QuotaInfo> {
  const info = await getQuotaInfo(user);
  if (info.limit <= 0) {
    throw new AuthError("Tài khoản này không được tạo bài mới (hạn mức = 0).", 403);
  }
  if (info.used >= info.limit) {
    throw new AuthError(
      `Đã hết hạn mức hôm nay (${info.used}/${info.limit} bài). Thử lại ngày mai hoặc liên hệ admin.`,
      429,
    );
  }
  return info;
}

export function editorialWhere(user: SessionUser): { createdById?: string } | Record<string, never> {
  if (isAdmin(user)) return {};
  return { createdById: user.userId };
}

export type ArticleAccess = Pick<Article, "id" | "createdById">;

export type OwnedResource = { createdById?: string | null };

/** Editor: own rows + legacy null (admin-only write). Admin: all. */
export function canAccessOwnedResource(
  user: SessionUser,
  resource: OwnedResource,
): boolean {
  if (isAdmin(user)) return true;
  return Boolean(resource.createdById && resource.createdById === user.userId);
}

export function assertCanAccessOwnedResource(
  user: SessionUser,
  resource: OwnedResource,
  resourceLabel = "resource",
): void {
  if (!canAccessOwnedResource(user, resource)) {
    throw new AuthError(`Không có quyền với ${resourceLabel} này`, 403);
  }
}

export function ownedResourceWhere(user: SessionUser): { createdById?: string } | Record<string, never> {
  return editorialWhere(user);
}

export function canAccessDigest(user: SessionUser, digest: OwnedResource): boolean {
  return canAccessOwnedResource(user, digest);
}

export function assertCanAccessDigest(user: SessionUser, digest: OwnedResource): void {
  assertCanAccessOwnedResource(user, digest, "digest");
}

export function canAccessSeries(user: SessionUser, series: OwnedResource): boolean {
  return canAccessOwnedResource(user, series);
}

export function assertCanAccessSeries(user: SessionUser, series: OwnedResource): void {
  assertCanAccessOwnedResource(user, series, "series");
}

/** Full pipeline body: owner, admin, or published reader-facing content. */
export function canViewArticleBody(
  user: SessionUser,
  article: { createdById?: string | null; workflowState: WorkflowState },
): boolean {
  if (isAdmin(user)) return true;
  if (canAccessArticle(user, article)) return true;
  return article.workflowState === WorkflowState.PUBLISHED;
}

export type SeriesArticleRow = {
  id: string;
  title: string | null;
  topic: string | null;
  status: string;
  workflowState: WorkflowState;
  domain: string;
  publishFormat: string;
  seriesOrder: number | null;
  publishedAt: Date | null;
  updatedAt: Date;
  createdById?: string | null;
  cleanPublish?: string | null;
};

/** Strip draft cleanPublish from users without access. */
export function sanitizeSeriesArticlesForUser<T extends SeriesArticleRow>(
  user: SessionUser,
  articles: T[],
): T[] {
  return articles.map((article) => {
    if (canViewArticleBody(user, article)) return article;
    return { ...article, cleanPublish: null };
  });
}
