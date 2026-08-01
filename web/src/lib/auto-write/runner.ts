import { ArticleStatus, WorkflowStep } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  computeNextRunAt,
  isDue,
  parseCustomTopics,
  parseSeedTopics,
  type AutoWriteSettings,
  type DomainId,
  type DomainMode,
} from "@/lib/auto-write/schedule";
import { isTopicUsed } from "@/lib/auto-write/topic-dedupe";
import { runWorkflowStep } from "@/lib/tfes/workflow";
import { isAwaitingHumanReview } from "@/lib/tfes/human-review";
import { REVIEW_DONE_MARK } from "@/lib/tfes/parser";
import {
  nextRotatedDomain,
  resolveDomainId,
  resolveDomainMode,
} from "@/lib/tfes/domains";
import { hydrateTfesOverrides } from "@/lib/tfes/tfes-docs";
import {
  DEFAULT_TARGET_WORD_COUNT,
  MAX_TARGET_WORD_COUNT,
  MIN_TARGET_WORD_COUNT,
} from "@/lib/tfes/writing-prefs";

const CONFIG_ID = "default";

async function countAwaitingHumanReview(): Promise<number> {
  const rows = await prisma.article.findMany({
    where: {
      status: { in: [ArticleStatus.DRAFT, ArticleStatus.RUNNING] },
      knowledgeRecord: { contains: REVIEW_DONE_MARK },
      OR: [{ factCheck: null }, { factCheck: "" }],
    },
    select: { knowledgeRecord: true, factCheck: true },
  });
  return rows.filter((r) => isAwaitingHumanReview(r)).length;
}

function isRunnableAutoDraft(article: {
  knowledgeRecord?: string | null;
  factCheck?: string | null;
}): boolean {
  return !isAwaitingHumanReview(article);
}

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
    domain: resolveDomainMode(row.domain),
    useSeedTopics: row.useSeedTopics,
    customTopics: row.customTopics ?? "",
    seedTopicsEngineering: row.seedTopicsEngineering ?? "",
    seedTopicsSoftSkills: row.seedTopicsSoftSkills ?? "",
    maxPendingReview: row.maxPendingReview,
    defaultTargetWordCount: row.defaultTargetWordCount ?? 1200,
    defaultAvoidFormats: row.defaultAvoidFormats ?? "table",
    ownerUserId: row.ownerUserId ?? null,
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
  domain: DomainMode;
  useSeedTopics: boolean;
  customTopics: string;
  seedTopicsEngineering: string;
  seedTopicsSoftSkills: string;
  maxPendingReview: number;
  defaultTargetWordCount: number;
  defaultAvoidFormats: string;
  ownerUserId: string | null;
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
      domain: input.domain ? resolveDomainMode(input.domain) : current.domain,
      useSeedTopics: input.useSeedTopics ?? current.useSeedTopics,
      customTopics: input.customTopics !== undefined ? input.customTopics : current.customTopics,
      seedTopicsEngineering:
        input.seedTopicsEngineering !== undefined
          ? input.seedTopicsEngineering
          : current.seedTopicsEngineering,
      seedTopicsSoftSkills:
        input.seedTopicsSoftSkills !== undefined
          ? input.seedTopicsSoftSkills
          : current.seedTopicsSoftSkills,
      maxPendingReview: Math.max(1, Math.min(20, input.maxPendingReview ?? current.maxPendingReview)),
      defaultTargetWordCount: Math.max(
        MIN_TARGET_WORD_COUNT,
        Math.min(
          MAX_TARGET_WORD_COUNT,
          input.defaultTargetWordCount ?? current.defaultTargetWordCount ?? DEFAULT_TARGET_WORD_COUNT,
        ),
      ),
      defaultAvoidFormats:
        input.defaultAvoidFormats !== undefined
          ? input.defaultAvoidFormats
          : current.defaultAvoidFormats,
      ownerUserId:
        input.ownerUserId !== undefined ? input.ownerUserId : current.ownerUserId,
      nextRunAt,
      ...(enabled === false ? {} : { lastError: null }),
    },
  });
}

async function pickDomain(
  mode: string,
  lastDomain: string | null,
): Promise<DomainId> {
  const resolved = resolveDomainMode(mode);
  if (resolved === "rotate") return nextRotatedDomain(lastDomain);
  return resolved;
}

async function collectUsedTopics(domain: DomainId): Promise<string[]> {
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
export async function pickFreshTopic(
  domain: DomainId | string,
  options: {
    useSeedTopics?: boolean;
    customTopics?: string | null;
    seedTopicsEngineering?: string | null;
    seedTopicsSoftSkills?: string | null;
  } = {},
): Promise<string> {
  return pickTopic(resolveDomainId(domain), {
    useSeed: options.useSeedTopics !== false,
    customTopics: options.customTopics ?? null,
    seedTopicsEngineering: options.seedTopicsEngineering ?? null,
    seedTopicsSoftSkills: options.seedTopicsSoftSkills ?? null,
  });
}

async function pickTopic(
  domain: DomainId,
  options: {
    useSeed: boolean;
    customTopics: string | null;
    seedTopicsEngineering: string | null;
    seedTopicsSoftSkills: string | null;
  },
): Promise<string> {
  const settingsSeeds =
    domain === "soft-skills"
      ? parseCustomTopics(options.seedTopicsSoftSkills)
      : domain === "engineering"
        ? parseCustomTopics(options.seedTopicsEngineering)
        : [];

  const pool = [
    ...(options.useSeed ? parseSeedTopics(domain) : []),
    ...settingsSeeds,
    ...parseCustomTopics(options.customTopics),
  ];

  // Dedup pool (giữ thứ tự)
  const seen = new Set<string>();
  const unique = pool.filter((t) => {
    const key = t.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const used = await collectUsedTopics(domain);
  const fresh = unique.filter((t) => !isTopicUsed(t, used));

  if (fresh.length === 0) {
    throw new Error(
      `Hết chủ đề mới cho domain “${domain}” (đã tránh trùng ${used.length} topic/title). Thêm seed trong Cài đặt / Domain Profile.`,
    );
  }

  return fresh[Math.floor(Math.random() * fresh.length)];
}

export async function runFullWorkflowToReview(articleId: string) {
  // Research2 + Insight3 + Write2 + Finalize3 (+ tối đa 2 vòng Gate→Research lại)
  for (let i = 0; i < 24; i++) {
    const article = await runWorkflowStep(articleId);
    if (
      article.status === ArticleStatus.PUBLISH_READY ||
      article.status === ArticleStatus.FAILED ||
      isAwaitingHumanReview(article)
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
  await hydrateTfesOverrides();
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

  const pendingReady = await prisma.article.count({
    where: { status: ArticleStatus.PUBLISH_READY },
  });
  const pendingHuman = await countAwaitingHumanReview();
  const pending = pendingReady + pendingHuman;
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
        lastError: `Bỏ qua: đã có ${pendingReady} chờ duyệt + ${pendingHuman} chờ Review người (max ${config.maxPendingReview})`,
      },
    });
    return {
      ran: false,
      skipped: `Đã đủ ${pending}/${config.maxPendingReview} bài chờ người (duyệt hoặc Review)`,
    };
  }

  // Resume bài auto chưa xong trước (bỏ qua bài đang chờ Review người)
  const autoDrafts = await prisma.article.findMany({
    where: {
      source: "auto",
      status: { in: [ArticleStatus.DRAFT, ArticleStatus.RUNNING] },
    },
    orderBy: { updatedAt: "desc" },
    take: 12,
  });
  let article = autoDrafts.find((a) => isRunnableAutoDraft(a)) ?? null;

  let topic = article?.topic ?? "";
  let domain = resolveDomainId(article?.domain);

  if (!article) {
    domain = await pickDomain(config.domain, config.lastDomain);
    try {
      topic = await pickFreshTopic(domain, {
        useSeedTopics: config.useSeedTopics,
        customTopics: config.customTopics,
        seedTopicsEngineering: config.seedTopicsEngineering,
        seedTopicsSoftSkills: config.seedTopicsSoftSkills,
      });
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
        targetWordCount: config.defaultTargetWordCount ?? 1200,
        avoidFormats: config.defaultAvoidFormats ?? "table",
        createdById: config.ownerUserId ?? undefined,
      },
    });
  } else {
    topic = article.topic || topic;
    domain = resolveDomainId(article.domain);
  }

  try {
    const finished = await runWorkflowStep(article.id);
    const awaitingHuman = isAwaitingHumanReview(finished);
    const done =
      finished.status === ArticleStatus.PUBLISH_READY ||
      finished.status === ArticleStatus.FAILED ||
      awaitingHuman;

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
            : awaitingHuman
              ? "Chờ người xác nhận Review AI — mở bài trên Biên tập"
              : done
                ? null
                : `Đang chạy dở (${finished.currentStep ?? finished.status}) — bấm Chạy ngay hoặc đợi tick tiếp`,
      },
    });

    return {
      ran: true,
      articleId: finished.id,
      status: awaitingHuman ? "AWAITING_HUMAN_REVIEW" : finished.status,
      topic,
      domain,
      error:
        finished.status === ArticleStatus.FAILED
          ? finished.errorMessage ?? undefined
          : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi auto-write";
    const isTimeout = /timed? ?out|timeout|Hobby chỉ cho/i.test(message);
    // Timeout: hẹn lại ~45s để tick/cron tự resume bước (không đợi lịch daily)
    const nextRunAt = isTimeout
      ? new Date(Date.now() + 45_000)
      : computeNextRunAt({
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
        lastError: isTimeout
          ? `Timeout — tự retry sau 45s: ${message}`.slice(0, 500)
          : message.slice(0, 500),
      },
    });
    await prisma.article.update({
      where: { id: article.id },
      data: {
        status: isTimeout ? ArticleStatus.DRAFT : ArticleStatus.FAILED,
        errorMessage: message.slice(0, 500),
      },
    });
    return {
      ran: true,
      articleId: article.id,
      status: isTimeout ? "DRAFT" : "FAILED",
      topic,
      domain,
      error: message,
    };
  }
}
