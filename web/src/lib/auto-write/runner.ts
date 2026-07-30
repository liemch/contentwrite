import { ArticleStatus, WorkflowStep } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  computeNextRunAt,
  isDue,
  parseCustomTopics,
  parseSeedTopics,
  type AutoWriteSettings,
} from "@/lib/auto-write/schedule";
import { isTopicUsed } from "@/lib/auto-write/topic-dedupe";
import { runWorkflowStep } from "@/lib/tfes/workflow";

const CONFIG_ID = "default";

export async function getAutoWriteConfig() {
  const existing = await prisma.autoWriteConfig.findUnique({ where: { id: CONFIG_ID } });
  if (existing) return existing;

  return prisma.autoWriteConfig.create({
    data: {
      id: CONFIG_ID,
      nextRunAt: computeNextRunAt({
        scheduleMode: "daily",
        intervalHours: 24,
        preferredHour: 9,
        timezone: "Asia/Ho_Chi_Minh",
      }),
    },
  });
}

export function serializeConfig(row: Awaited<ReturnType<typeof getAutoWriteConfig>>): AutoWriteSettings {
  return {
    enabled: row.enabled,
    scheduleMode: row.scheduleMode === "interval" ? "interval" : "daily",
    intervalHours: row.intervalHours,
    preferredHour: row.preferredHour,
    timezone: row.timezone,
    domain:
      row.domain === "soft-skills" || row.domain === "rotate" ? row.domain : "engineering",
    useSeedTopics: row.useSeedTopics,
    customTopics: row.customTopics ?? "",
    maxPendingReview: row.maxPendingReview,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastError: row.lastError,
    lastArticleId: row.lastArticleId,
    lastDomain: row.lastDomain,
  };
}

export type UpdateAutoWriteInput = Partial<{
  enabled: boolean;
  scheduleMode: "interval" | "daily";
  intervalHours: number;
  preferredHour: number;
  timezone: string;
  domain: "engineering" | "soft-skills" | "rotate";
  useSeedTopics: boolean;
  customTopics: string;
  maxPendingReview: number;
}>;

export async function updateAutoWriteConfig(input: UpdateAutoWriteInput) {
  const current = await getAutoWriteConfig();
  const scheduleMode = input.scheduleMode ?? (current.scheduleMode === "interval" ? "interval" : "daily");
  const intervalHours = Math.max(1, Math.min(168, input.intervalHours ?? current.intervalHours));
  const preferredHour = Math.max(0, Math.min(23, input.preferredHour ?? current.preferredHour));
  const timezone = input.timezone ?? current.timezone;
  const enabled = input.enabled ?? current.enabled;

  const nextRunAt = computeNextRunAt({
    scheduleMode,
    intervalHours,
    preferredHour,
    timezone,
    from: new Date(),
  });

  return prisma.autoWriteConfig.update({
    where: { id: CONFIG_ID },
    data: {
      enabled,
      scheduleMode,
      intervalHours,
      preferredHour,
      timezone,
      domain: input.domain ?? current.domain,
      useSeedTopics: input.useSeedTopics ?? current.useSeedTopics,
      customTopics: input.customTopics !== undefined ? input.customTopics : current.customTopics,
      maxPendingReview: Math.max(1, Math.min(20, input.maxPendingReview ?? current.maxPendingReview)),
      nextRunAt,
      ...(enabled === false ? {} : { lastError: null }),
    },
  });
}

async function pickDomain(
  mode: string,
  lastDomain: string | null,
): Promise<"engineering" | "soft-skills"> {
  if (mode === "soft-skills") return "soft-skills";
  if (mode === "engineering") return "engineering";
  return lastDomain === "engineering" ? "soft-skills" : "engineering";
}

async function collectUsedTopics(domain: "engineering" | "soft-skills"): Promise<string[]> {
  const [articles, knowledge] = await Promise.all([
    prisma.article.findMany({
      where: { domain },
      select: { topic: true, title: true },
    }),
    prisma.knowledgeRecord.findMany({
      where: { domain },
      select: { title: true, keywords: true },
    }),
  ]);

  const used: string[] = [];
  for (const a of articles) {
    if (a.topic) used.push(a.topic);
    if (a.title) used.push(a.title);
  }
  for (const k of knowledge) {
    if (k.title) used.push(k.title);
    if (k.keywords) {
      for (const part of k.keywords.split(/[,;|]/)) {
        const t = part.trim();
        if (t.length > 3) used.push(t);
      }
    }
  }
  return used;
}

/**
 * Chọn topic chưa trùng bài đã có.
 * Hết chủ đề mới → throw (auto bỏ qua lần chạy, không quay vòng trùng).
 */
async function pickTopic(
  domain: "engineering" | "soft-skills",
  useSeed: boolean,
  customTopics: string | null,
): Promise<string> {
  const pool = [
    ...(useSeed ? parseSeedTopics(domain) : []),
    ...parseCustomTopics(customTopics),
  ];

  const used = await collectUsedTopics(domain);
  const fresh = pool.filter((t) => !isTopicUsed(t, used));

  if (fresh.length === 0) {
    throw new Error(
      `Hết chủ đề mới cho domain “${domain}” (đã tránh trùng ${used.length} topic/title). Thêm dòng vào Custom topics trong /settings.`,
    );
  }

  return fresh[Math.floor(Math.random() * fresh.length)];
}

export async function runFullWorkflowToReview(articleId: string) {
  // Research2 + Insight + Write2 + Finalize2 → tối đa ~8–10 bước
  for (let i = 0; i < 14; i++) {
    const article = await runWorkflowStep(articleId);
    if (
      article.status === ArticleStatus.PUBLISH_READY ||
      article.status === ArticleStatus.FAILED
    ) {
      return article;
    }
  }
  return prisma.article.findUniqueOrThrow({ where: { id: articleId } });
}

export type AutoWriteRunResult = {
  ran: boolean;
  skipped?: string;
  articleId?: string;
  status?: string;
  topic?: string;
  domain?: string;
  error?: string;
};

/**
 * Tick lịch auto-write — CHỈ 1 run-step / lần gọi (Hobby ≤60s).
 * - Resume bài auto đang DRAFT trước khi tạo bài mới
 * - force=true: bỏ qua nextRunAt (nút Chạy ngay nên loop phía client)
 */
export async function tickAutoWrite(options: { force?: boolean } = {}): Promise<AutoWriteRunResult> {
  const config = await getAutoWriteConfig();
  const force = options.force === true;

  if (!force && !config.enabled) {
    return { ran: false, skipped: "Auto-write đang tắt" };
  }

  if (!force && !isDue(config.nextRunAt)) {
    return {
      ran: false,
      skipped: `Chưa đến giờ (next: ${config.nextRunAt?.toISOString() ?? "—"})`,
    };
  }

  // Bài kẹt RUNNING sau 504/timeout → về DRAFT để resume
  const staleCutoff = new Date(Date.now() - 90_000);
  await prisma.article.updateMany({
    where: {
      status: ArticleStatus.RUNNING,
      updatedAt: { lt: staleCutoff },
    },
    data: {
      status: ArticleStatus.DRAFT,
      errorMessage: "Recovered after timeout — chạy lại bước hiện tại",
    },
  });

  const running = await prisma.article.count({
    where: {
      source: "auto",
      status: ArticleStatus.RUNNING,
      updatedAt: { gte: staleCutoff },
    },
  });
  if (running > 0) {
    return { ran: false, skipped: "Đang có bài auto RUNNING" };
  }

  const pending = await prisma.article.count({
    where: { status: ArticleStatus.PUBLISH_READY },
  });
  if (pending >= config.maxPendingReview) {
    const nextRunAt = computeNextRunAt({
      scheduleMode: config.scheduleMode === "interval" ? "interval" : "daily",
      intervalHours: config.intervalHours,
      preferredHour: config.preferredHour,
      timezone: config.timezone,
    });
    await prisma.autoWriteConfig.update({
      where: { id: CONFIG_ID },
      data: {
        nextRunAt,
        lastError: `Bỏ qua: đã có ${pending} bài chờ duyệt (max ${config.maxPendingReview})`,
      },
    });
    return {
      ran: false,
      skipped: `Đã đủ ${pending}/${config.maxPendingReview} bài chờ duyệt`,
    };
  }

  // Resume bài auto chưa xong trước
  let article = await prisma.article.findFirst({
    where: {
      source: "auto",
      status: { in: [ArticleStatus.DRAFT, ArticleStatus.RUNNING] },
    },
    orderBy: { updatedAt: "desc" },
  });

  let topic = article?.topic ?? "";
  let domain = (article?.domain as "engineering" | "soft-skills") || "engineering";

  if (!article) {
    domain = await pickDomain(config.domain, config.lastDomain);
    try {
      topic = await pickTopic(domain, config.useSeedTopics, config.customTopics);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hết chủ đề mới";
      const nextRunAt = computeNextRunAt({
        scheduleMode: config.scheduleMode === "interval" ? "interval" : "daily",
        intervalHours: config.intervalHours,
        preferredHour: config.preferredHour,
        timezone: config.timezone,
      });
      await prisma.autoWriteConfig.update({
        where: { id: CONFIG_ID },
        data: { nextRunAt, lastError: message, lastDomain: domain },
      });
      return { ran: false, skipped: message, domain };
    }

    article = await prisma.article.create({
      data: {
        topic,
        domain,
        source: "auto",
        status: ArticleStatus.DRAFT,
        currentStep: WorkflowStep.RESEARCH,
      },
    });
  } else {
    topic = article.topic || topic;
    domain = (article.domain as "engineering" | "soft-skills") || domain;
  }

  try {
    const finished = await runWorkflowStep(article.id);
    const done =
      finished.status === ArticleStatus.PUBLISH_READY ||
      finished.status === ArticleStatus.FAILED;

    // Chưa xong: hẹn lại sớm hơn để cron/client tiếp tục (Hobby cron 1 lần/ngày thì dùng nút Chạy ngay)
    const nextRunAt = done
      ? computeNextRunAt({
          scheduleMode: config.scheduleMode === "interval" ? "interval" : "daily",
          intervalHours: config.intervalHours,
          preferredHour: config.preferredHour,
          timezone: config.timezone,
        })
      : new Date(Date.now() + 60_000);

    await prisma.autoWriteConfig.update({
      where: { id: CONFIG_ID },
      data: {
        lastRunAt: new Date(),
        nextRunAt,
        lastArticleId: finished.id,
        lastDomain: domain,
        lastError:
          finished.status === ArticleStatus.FAILED
            ? finished.errorMessage ?? "Pipeline FAILED"
            : done
              ? null
              : `Đang chạy dở (${finished.currentStep ?? finished.status}) — bấm Chạy ngay hoặc đợi tick tiếp`,
      },
    });

    return {
      ran: true,
      articleId: finished.id,
      status: finished.status,
      topic,
      domain,
      error:
        finished.status === ArticleStatus.FAILED
          ? finished.errorMessage ?? undefined
          : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi auto-write";
    const nextRunAt = computeNextRunAt({
      scheduleMode: config.scheduleMode === "interval" ? "interval" : "daily",
      intervalHours: config.intervalHours,
      preferredHour: config.preferredHour,
      timezone: config.timezone,
    });
    await prisma.autoWriteConfig.update({
      where: { id: CONFIG_ID },
      data: {
        lastRunAt: new Date(),
        nextRunAt,
        lastArticleId: article.id,
        lastDomain: domain,
        lastError: message.slice(0, 500),
      },
    });
    await prisma.article.update({
      where: { id: article.id },
      data: { status: ArticleStatus.FAILED, errorMessage: message.slice(0, 500) },
    });
    return { ran: true, articleId: article.id, status: "FAILED", topic, domain, error: message };
  }
}
