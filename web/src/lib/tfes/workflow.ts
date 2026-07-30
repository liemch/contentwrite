import { ArticleStatus, WorkflowStep, type Article } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { chatCompletion } from "@/lib/nvidia";
import { formatSearchResults, webSearch } from "@/lib/search";
import { appendContext, parseFullOutput } from "@/lib/tfes/parser";
import {
  buildDailyTaskPrompt,
  buildPipelinePrompt,
  buildResearchPrompt,
  getSystemPrompt,
} from "@/lib/tfes/prompts";

export const STEP_ORDER: WorkflowStep[] = [
  WorkflowStep.RESEARCH,
  WorkflowStep.INSIGHT,
  WorkflowStep.WRITE,
  WorkflowStep.FINALIZE,
];

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
      take: 15,
    }),
    prisma.article.findMany({
      where: {
        domain,
        status: { in: [ArticleStatus.PUBLISH_READY, ArticleStatus.APPROVED, ArticleStatus.PUBLISHED] },
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
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
              `- ${r.title} | ${r.category ?? "N/A"} | keywords: ${r.keywords ?? ""} | core: ${(r.coreMessage ?? "").slice(0, 120)}`,
          )
          .join("\n");

  return `${memory}

## Bài đã có (TRÁNH trùng góc / cùng chủ đề)
${avoidList || "(trống)"}
Khi chọn góc viết: phải khác rõ các bài trên — cùng technology thì đổi trade-off / audience / failure mode.`;
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
    const systemPrompt = getSystemPrompt(article.domain);
    const memory = await getEditorialMemory(article.domain);
    const topic =
      article.topic?.trim() ||
      "Chọn chủ đề phù hợp domain profile, ưu tiên seed_topics nếu đang Seeding Mode";

    let patch: Partial<Article> = { currentStep: step };

    if (step === WorkflowStep.RESEARCH) {
      const queries = [
        `${topic} engineering best practices`,
        `${topic} architecture trade-offs`,
        `${topic} critique limitations`,
      ];

      const allResults = await Promise.all(queries.map((q) => webSearch(q)));
      const searchBlob = allResults
        .map((results, i) => `Query ${i + 1}: ${queries[i]}\n${formatSearchResults(results)}`)
        .join("\n\n=====\n\n");

      const researchBrief = await chatCompletion([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildDailyTaskPrompt({
            domain: article.domain,
            topic: article.topic ?? undefined,
            editorialMemory: memory,
          }),
        },
        { role: "user", content: buildResearchPrompt(topic, searchBlob) },
      ]);

      patch = {
        researchBrief,
        currentStep: WorkflowStep.INSIGHT,
        status: ArticleStatus.DRAFT,
      };
    } else if (step === WorkflowStep.INSIGHT) {
      const insightGate = await chatCompletion([
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: buildPipelinePrompt(
            "insight",
            appendContext(article.researchBrief, `Chủ đề: ${topic}`),
          ),
        },
      ]);

      // Chỉ fail khi tự xếp hạng kết luận là L0/L1 (tránh match nhầm vì text có nhắc thang L0–L3)
      const failedGate =
        /(?:cấp|level|xếp hạng|đạt|insight)\s*[:=]?\s*L[01]\b/i.test(insightGate) ||
        /chỉ\s+L[01]\b/i.test(insightGate) ||
        /< L2/i.test(insightGate) ||
        /không đạt\s*(≥\s*)?L2/i.test(insightGate) ||
        /đổi chủ đề/i.test(insightGate);

      if (failedGate) {
        await prisma.article.update({
          where: { id: articleId },
          data: {
            insightGate,
            status: ArticleStatus.FAILED,
            currentStep: WorkflowStep.INSIGHT,
            errorMessage:
              "Insight Gate chưa đạt L2. Xem insightGate, đổi chủ đề rồi tạo bài mới hoặc reset.",
          },
        });
        return prisma.article.findUniqueOrThrow({ where: { id: articleId } });
      }

      patch = {
        insightGate,
        currentStep: WorkflowStep.WRITE,
        status: ArticleStatus.DRAFT,
        errorMessage: null,
      };
    } else if (step === WorkflowStep.WRITE) {
      const draft12 = await chatCompletion(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: buildPipelinePrompt(
              "write",
              appendContext(article.researchBrief, article.insightGate, `Chủ đề: ${topic}`),
            ),
          },
        ],
        { maxTokens: 16384 },
      );

      patch = { draft12, currentStep: WorkflowStep.FINALIZE, status: ArticleStatus.DRAFT };
    } else if (step === WorkflowStep.FINALIZE) {
      const finalizeOutput = await chatCompletion(
        [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: buildPipelinePrompt(
              "finalize",
              appendContext(
                article.researchBrief,
                article.insightGate,
                article.draft12,
                `Chủ đề: ${topic}`,
              ),
            ),
          },
        ],
        { maxTokens: 16384 },
      );

      const parsed = parseFullOutput(
        appendContext(article.researchBrief, article.insightGate, article.draft12, finalizeOutput),
      );

      const titleMatch = parsed.cleanPublish?.match(/^#\s+(.+)$/m);
      const title = titleMatch?.[1]?.trim() ?? article.topic ?? "Untitled";

      patch = {
        factCheck: parsed.factCheck ?? finalizeOutput,
        knowledgeRecord: parsed.knowledgeRecord,
        cleanPublish: parsed.cleanPublish,
        heroBrief: parsed.heroBrief,
        title,
        status: ArticleStatus.PUBLISH_READY,
        currentStep: null,
      };
    }

    return prisma.article.update({
      where: { id: articleId },
      data: patch,
    });
  } catch (error) {
    const { redactSecrets } = await import("@/lib/http-client");
    const raw = error instanceof Error ? error.message : "Lỗi không xác định";
    return prisma.article.update({
      where: { id: articleId },
      data: {
        status: ArticleStatus.FAILED,
        errorMessage: redactSecrets(raw).slice(0, 500),
      },
    });
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
