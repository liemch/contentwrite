import { ArticleStatus, WorkflowStep, type Article } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { chatCompletion } from "@/lib/nvidia";
import { formatSearchResults, webSearch } from "@/lib/search";
import { appendContext, clipText, parseFullOutput } from "@/lib/tfes/parser";
import {
  buildDailyTaskPrompt,
  buildPipelinePrompt,
  buildResearchPrompt,
  getCompactStepPrompt,
} from "@/lib/tfes/prompts";

export const STEP_ORDER: WorkflowStep[] = [
  WorkflowStep.RESEARCH,
  WorkflowStep.INSIGHT,
  WorkflowStep.WRITE,
  WorkflowStep.FINALIZE,
];

const WRITE_HALF_MARK = "<!--TFES_DRAFT_HALF-->";

export function nextStep(current: WorkflowStep | null): WorkflowStep | null {
  if (!current) return WorkflowStep.RESEARCH;
  const idx = STEP_ORDER.indexOf(current);
  if (idx < 0 || idx >= STEP_ORDER.length - 1) return null;
  return STEP_ORDER[idx + 1];
}

async function getEditorialMemory(domain: string): Promise<string> {
  const [records, recentArticles] = await Promise.all([
    prisma.knowledgeRecord.findMany({
      where: { domain },
      orderBy: { publishedAt: "desc" },
      take: 8,
    }),
    prisma.article.findMany({
      where: {
        domain,
        status: { in: [ArticleStatus.PUBLISH_READY, ArticleStatus.APPROVED, ArticleStatus.PUBLISHED] },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
      select: { title: true, topic: true },
    }),
  ]);

  const avoidList = recentArticles
    .map((a) => `- ${(a.title || a.topic || "").trim()}`)
    .filter((l) => l.length > 3)
    .join("\n");

  if (records.length === 0 && !avoidList) {
    return "kho đang trống — chạy Seeding Mode";
  }

  const memory =
    records.length === 0
      ? "kho knowledge chưa có record đã duyệt"
      : records
          .map(
            (r) =>
              `- ${r.title} | ${r.category ?? "N/A"} | keywords: ${r.keywords ?? ""} | core: ${(r.coreMessage ?? "").slice(0, 80)}`,
          )
          .join("\n");

  return `${memory}

## Bài đã có (TRÁNH trùng góc)
${avoidList || "(trống)"}`;
}

type StepTimings = {
  searchMs?: number;
  llmMs?: number;
  searchHits?: number;
  searchQueries?: number;
  researchPhase?: string;
  writePhase?: string;
  finalizePhase?: string;
};

function withTimings(article: Article, timings: StepTimings) {
  return Object.assign(article, { _timings: timings });
}

export async function runWorkflowStep(articleId: string): Promise<Article> {
  const article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) {
    throw new Error("Không tìm thấy bài viết");
  }

  if (article.status === ArticleStatus.PUBLISHED) {
    throw new Error("Bài đã publish, không thể chạy lại pipeline");
  }

  const step = article.currentStep ?? WorkflowStep.RESEARCH;

  await prisma.article.update({
    where: { id: articleId },
    data: { status: ArticleStatus.RUNNING, errorMessage: null },
  });

  try {
    const topic =
      article.topic?.trim() ||
      "Chọn chủ đề phù hợp domain profile, ưu tiên seed_topics nếu đang Seeding Mode";

    if (step === WorkflowStep.RESEARCH) {
      const SEARCH_MARK = "<!--TFES_SEARCH_BLOB-->";
      const existingBrief = article.researchBrief ?? "";

      // Phase 1: chỉ Tavily
      if (!existingBrief.includes(SEARCH_MARK)) {
        const queries = [
          `${topic} architecture trade-offs`,
          `${topic} limitations critique`,
        ];

        const searchStarted = Date.now();
        const allResults = await Promise.all(
          queries.map((q) => webSearch(q, { depth: "basic", maxResults: 4 })),
        );
        const searchMs = Date.now() - searchStarted;
        const hitCount = allResults.reduce((n, r) => n + r.length, 0);
        const searchBlob = allResults
          .map((results, i) => `Query ${i + 1}: ${queries[i]}\n${formatSearchResults(results)}`)
          .join("\n\n=====\n\n");

        if (hitCount === 0) {
          throw new Error(
            "Tavily không trả kết quả nào — kiểm tra TAVILY_API_KEY hoặc thử topic khác.",
          );
        }

        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            researchBrief: `${SEARCH_MARK}\n${searchBlob}`,
            currentStep: WorkflowStep.RESEARCH,
            status: ArticleStatus.DRAFT,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          searchMs,
          llmMs: 0,
          searchHits: hitCount,
          searchQueries: queries.length,
          researchPhase: "search",
        });
      }

      // Phase 2: GLM Research Brief (prompt gọn)
      const memory = await getEditorialMemory(article.domain);
      const searchBlob = clipText(existingBrief.replace(SEARCH_MARK, "").trim(), 6_000);
      const llmStarted = Date.now();
      const researchBrief = await chatCompletion(
        [
          { role: "system", content: getCompactStepPrompt(article.domain, "research") },
          {
            role: "user",
            content: buildDailyTaskPrompt({
              domain: article.domain,
              topic: article.topic ?? undefined,
              editorialMemory: clipText(memory, 1_500),
            }),
          },
          { role: "user", content: buildResearchPrompt(topic, searchBlob) },
        ],
        { maxTokens: 1800 },
      );

      const updated = await prisma.article.update({
        where: { id: articleId },
        data: {
          researchBrief,
          currentStep: WorkflowStep.INSIGHT,
          status: ArticleStatus.DRAFT,
        },
      });
      return withTimings(updated, {
        searchMs: 0,
        llmMs: Date.now() - llmStarted,
        researchPhase: "llm",
      });
    }

    if (step === WorkflowStep.INSIGHT) {
      const llmStarted = Date.now();
      const insightGate = await chatCompletion(
        [
          { role: "system", content: getCompactStepPrompt(article.domain, "insight") },
          {
            role: "user",
            content: buildPipelinePrompt(
              "insight",
              appendContext(clipText(article.researchBrief, 4_500), `Chủ đề: ${topic}`),
            ),
          },
        ],
        { maxTokens: 900 },
      );

      const failedGate =
        /(?:cấp|level|xếp hạng|đạt|insight)\s*[:=]?\s*L[01]\b/i.test(insightGate) ||
        /chỉ\s+L[01]\b/i.test(insightGate) ||
        /< L2/i.test(insightGate) ||
        /không đạt\s*(≥\s*)?L2/i.test(insightGate) ||
        /đổi chủ đề/i.test(insightGate);

      if (failedGate) {
        const failed = await prisma.article.update({
          where: { id: articleId },
          data: {
            insightGate,
            status: ArticleStatus.FAILED,
            currentStep: WorkflowStep.INSIGHT,
            errorMessage:
              "Insight Gate chưa đạt L2. Xem insightGate, đổi chủ đề rồi tạo bài mới hoặc reset.",
          },
        });
        return withTimings(failed, { llmMs: Date.now() - llmStarted });
      }

      const updated = await prisma.article.update({
        where: { id: articleId },
        data: {
          insightGate,
          currentStep: WorkflowStep.WRITE,
          status: ArticleStatus.DRAFT,
          errorMessage: null,
        },
      });
      return withTimings(updated, { llmMs: Date.now() - llmStarted });
    }

    if (step === WorkflowStep.WRITE) {
      const draft = article.draft12 ?? "";

      // Phase A: nửa đầu (1 lần gọi)
      if (!draft || !draft.includes(WRITE_HALF_MARK)) {
        const llmStarted = Date.now();
        const partA = await chatCompletion(
          [
            { role: "system", content: getCompactStepPrompt(article.domain, "write") },
            {
              role: "user",
              content: buildPipelinePrompt(
                "write-a",
                appendContext(
                  clipText(article.researchBrief, 3_500),
                  clipText(article.insightGate, 2_000),
                  `Chủ đề: ${topic}`,
                ),
              ),
            },
          ],
          { maxTokens: 1600 },
        );

        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            draft12: `${partA.trim()}\n\n${WRITE_HALF_MARK}`,
            currentStep: WorkflowStep.WRITE,
            status: ArticleStatus.DRAFT,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          writePhase: "a",
        });
      }

      // Phase B: nửa sau
      const llmStarted = Date.now();
      const partA = draft.replace(WRITE_HALF_MARK, "").trim();
      const partB = await chatCompletion(
        [
          { role: "system", content: getCompactStepPrompt(article.domain, "write") },
          {
            role: "user",
            content: buildPipelinePrompt(
              "write-b",
              appendContext(
                clipText(article.insightGate, 1_500),
                clipText(partA, 5_000),
                `Chủ đề: ${topic}`,
              ),
            ),
          },
        ],
        { maxTokens: 1600 },
      );

      const updated = await prisma.article.update({
        where: { id: articleId },
        data: {
          draft12: `${partA}\n\n${partB.trim()}`,
          currentStep: WorkflowStep.FINALIZE,
          status: ArticleStatus.DRAFT,
        },
      });
      return withTimings(updated, {
        llmMs: Date.now() - llmStarted,
        writePhase: "b",
      });
    }

    if (step === WorkflowStep.FINALIZE) {
      // Phase A: fact-check + knowledge
      if (!article.factCheck) {
        const llmStarted = Date.now();
        const finalizeA = await chatCompletion(
          [
            { role: "system", content: getCompactStepPrompt(article.domain, "finalize") },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-a",
                appendContext(
                  clipText(article.insightGate, 1_200),
                  clipText(article.draft12, 6_000),
                  `Chủ đề: ${topic}`,
                ),
              ),
            },
          ],
          { maxTokens: 1400 },
        );

        const parsed = parseFullOutput(finalizeA);
        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            factCheck: parsed.factCheck ?? finalizeA,
            knowledgeRecord: parsed.knowledgeRecord ?? null,
            currentStep: WorkflowStep.FINALIZE,
            status: ArticleStatus.DRAFT,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: "a",
        });
      }

      // Phase B: bản sạch + hero
      const llmStarted = Date.now();
      const finalizeB = await chatCompletion(
        [
          { role: "system", content: getCompactStepPrompt(article.domain, "finalize") },
          {
            role: "user",
            content: buildPipelinePrompt(
              "finalize-b",
              appendContext(
                clipText(article.insightGate, 1_000),
                clipText(article.draft12, 7_000),
                clipText(article.knowledgeRecord, 800),
                `Chủ đề: ${topic}`,
              ),
            ),
          },
        ],
        { maxTokens: 1800 },
      );

      const parsed = parseFullOutput(
        appendContext(article.draft12, article.factCheck, finalizeB),
      );
      const titleMatch = parsed.cleanPublish?.match(/^#\s+(.+)$/m);
      const title = titleMatch?.[1]?.trim() ?? article.topic ?? "Untitled";

      const updated = await prisma.article.update({
        where: { id: articleId },
        data: {
          factCheck: article.factCheck,
          knowledgeRecord: parsed.knowledgeRecord ?? article.knowledgeRecord,
          cleanPublish: parsed.cleanPublish ?? finalizeB,
          heroBrief: parsed.heroBrief,
          title,
          status: ArticleStatus.PUBLISH_READY,
          currentStep: null,
        },
      });
      return withTimings(updated, {
        llmMs: Date.now() - llmStarted,
        finalizePhase: "b",
      });
    }

    throw new Error(`Bước không hợp lệ: ${step}`);
  } catch (error) {
    const { redactSecrets } = await import("@/lib/http-client");
    const raw = error instanceof Error ? error.message : "Lỗi không xác định";
    const isTimeout = /timed? ?out|timeout|Request timed out|Hobby chỉ cho/i.test(raw);
    // Timeout: giữ DRAFT để bấm lại tiếp tục (Write/Finalize đã tách phase)
    await prisma.article.update({
      where: { id: articleId },
      data: {
        status: isTimeout ? ArticleStatus.DRAFT : ArticleStatus.FAILED,
        errorMessage: redactSecrets(raw).slice(0, 500),
      },
    });
    throw error instanceof Error ? error : new Error(raw);
  }
}

export async function resetWorkflow(articleId: string): Promise<Article> {
  return prisma.article.update({
    where: { id: articleId },
    data: {
      status: ArticleStatus.DRAFT,
      currentStep: WorkflowStep.RESEARCH,
      errorMessage: null,
      researchBrief: null,
      insightGate: null,
      draft12: null,
      factCheck: null,
      knowledgeRecord: null,
      cleanPublish: null,
      heroBrief: null,
      heroImageUrl: null,
      heroImageModel: null,
      heroImageAlt: null,
      heroPromptUsed: null,
    },
  });
}

export async function approveArticle(articleId: string, notes?: string): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });

  if (article.status !== ArticleStatus.PUBLISH_READY) {
    throw new Error("Chỉ duyệt bài ở trạng thái Publish Ready");
  }

  const updated = await prisma.article.update({
    where: { id: articleId },
    data: {
      status: ArticleStatus.APPROVED,
      reviewerNotes: notes,
      approvedAt: new Date(),
    },
  });

  if (article.title) {
    await prisma.knowledgeRecord.upsert({
      where: { articleId },
      create: {
        articleId,
        title: article.title,
        domain: article.domain,
        coreMessage: article.knowledgeRecord ?? undefined,
      },
      update: {
        title: article.title,
        coreMessage: article.knowledgeRecord ?? undefined,
      },
    });
  }

  return updated;
}

export async function publishArticle(articleId: string): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });

  if (article.status !== ArticleStatus.APPROVED && article.status !== ArticleStatus.PUBLISH_READY) {
    throw new Error("Bài cần được duyệt trước khi publish");
  }

  return prisma.article.update({
    where: { id: articleId },
    data: {
      status: ArticleStatus.PUBLISHED,
      publishedAt: new Date(),
    },
  });
}
