import { ArticleStatus, WorkflowStep, type Article } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { chatCompletion } from "@/lib/nvidia";
import { pickFreshTopic, getAutoWriteConfig } from "@/lib/auto-write/runner";
import { formatSearchResults, webSearch } from "@/lib/search";
import {
  appendContext,
  clipText,
  gateRetryCount,
  INSIGHT_DECISION_MARK,
  INSIGHT_DONE_MARK,
  INSIGHT_GATE_MARK,
  parseFullOutput,
  REVIEW_DONE_MARK,
  stripPipelineMarks,
  withGateRetryMark,
  WRITE_DONE_MARK,
  WRITE_HALF_MARK,
} from "@/lib/tfes/parser";
import {
  assertFullDraftQuality,
  assertWritePhaseQuality,
  editorialSelfCheck,
} from "@/lib/tfes/quality";
import {
  buildDailyTaskPrompt,
  buildPipelinePrompt,
  buildResearchPrompt,
  getSystemPrompt,
  getSystemPromptLite,
} from "@/lib/tfes/prompts";
import {
  sanitizeEditorialBody,
  stripInsightLevelLabels,
} from "@/lib/publish-content";

/** Câu placeholder từng bị nhầm thành topic khi tạo bài không nhập chủ đề */
function isPlaceholderTopic(topic: string | null | undefined): boolean {
  const t = (topic ?? "").trim();
  if (!t) return true;
  return /seed_topics|domain profile|Seeding Mode|tự chọn theo|ưu tiên seed/i.test(t);
}

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
  insightPhase?: string;
  writePhase?: string;
  finalizePhase?: string;
};

function withTimings(article: Article, timings: StepTimings) {
  return Object.assign(article, { _timings: timings });
}

function insightPhaseOf(
  insightGate: string | null | undefined,
): "gate" | "decision" | "planning" | "done" {
  const g = insightGate ?? "";
  if (!g.trim()) return "gate";
  if (g.includes(INSIGHT_DONE_MARK)) return "done";
  if (g.includes(INSIGHT_DECISION_MARK)) return "planning";
  if (g.includes(INSIGHT_GATE_MARK)) return "decision";
  // Đã fail Gate → research lại: chỉ có GATE_RETRY, chưa có GATE_MARK → chạy Gate mới
  if (gateRetryCount(g) > 0) return "gate";
  // Legacy: đủ Decision+Planning không marker
  if (
    g.length > 350 &&
    /Editorial Decision|Core Message|Key Insights|quyết định biên tập|Planning/i.test(g)
  ) {
    return "done";
  }
  if (g.length > 80) return "decision";
  return "gate";
}

/** Tối đa research lại sau Gate < L2 (2 lần = tổng 3 lần Gate) */
const MAX_GATE_RESEARCH_RETRIES = 2;

function finalizePhaseOf(article: {
  knowledgeRecord?: string | null;
  factCheck?: string | null;
  cleanPublish?: string | null;
}): "review" | "fact" | "publish" | "done" {
  const kr = article.knowledgeRecord ?? "";
  const fc = article.factCheck ?? "";
  const clean = (article.cleanPublish ?? "").trim();
  const reviewDone = kr.includes(REVIEW_DONE_MARK) || Boolean(fc.trim());
  if (!reviewDone) return "review";
  if (!fc.trim()) return "fact";
  if (clean.length < 80) return "publish";
  return "done";
}

function failedInsightGate(text: string): boolean {
  // Ưu tiên tín hiệu đạt rõ ràng
  if (
    /\bL[23]\b/.test(text) &&
    /ĐẠT\s*≥\s*L2|đạt\s*≥\s*L2|được viết/i.test(text) &&
    !/CHƯA ĐẠT|không đạt\s*(≥\s*)?L2/i.test(text)
  ) {
    return false;
  }
  return (
    /CHƯA ĐẠT/i.test(text) ||
    /(?:cấp|level|xếp hạng)\s*[:=]?\s*L[01]\b/i.test(text) ||
    /chỉ\s+L[01]\b/i.test(text) ||
    /< L2/i.test(text) ||
    /không đạt\s*(≥\s*)?L2/i.test(text) ||
    /đề xuất đổi (chủ đề|góc)/i.test(text)
  );
}

export async function runWorkflowStep(articleId: string): Promise<Article> {
  let article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) {
    throw new Error("Không tìm thấy bài viết");
  }

  if (article.status === ArticleStatus.PUBLISHED) {
    throw new Error(`Bài đã đăng, không thể chạy lại chu trình`);
  }

  const step = article.currentStep ?? WorkflowStep.RESEARCH;

  await prisma.article.update({
    where: { id: articleId },
    data: { status: ArticleStatus.RUNNING, errorMessage: null },
  });

  try {
    let topic = article.topic?.trim() || "";

    // Topic trống / placeholder cũ → chọn seed thật và lưu lại trước khi research
    if (isPlaceholderTopic(topic)) {
      const domain = article.domain === "soft-skills" ? "soft-skills" : "engineering";
      const config = await getAutoWriteConfig();
      topic = await pickFreshTopic(domain, {
        useSeedTopics: config.useSeedTopics,
        customTopics: config.customTopics,
        seedTopicsEngineering: config.seedTopicsEngineering,
        seedTopicsSoftSkills: config.seedTopicsSoftSkills,
      });
      article = await prisma.article.update({
        where: { id: articleId },
        data: { topic },
      });
    }

    if (step === WorkflowStep.RESEARCH) {
      const SEARCH_MARK = "<!--TFES_SEARCH_BLOB-->";
      const existingBrief = article.researchBrief ?? "";

      // Phase 1: Tavily — ≥3 nguồn, có góc phản biện (AI-TFES)
      if (!existingBrief.includes(SEARCH_MARK)) {
        const queries = [
          `${topic} official documentation architecture best practices`,
          `${topic} trade-offs limitations decisions`,
          `${topic} critique pitfalls failure modes OR anti-patterns`,
        ];

        const searchStarted = Date.now();
        const allResults = await Promise.all(
          queries.map((q) => webSearch(q, { depth: "basic", maxResults: 5 })),
        );
        const searchMs = Date.now() - searchStarted;
        const hitCount = allResults.reduce((n, r) => n + r.length, 0);
        const uniqueUrls = new Set(
          allResults.flat().map((r) => r.url).filter(Boolean),
        );
        const searchBlob = allResults
          .map((results, i) => `Query ${i + 1}: ${queries[i]}\n${formatSearchResults(results)}`)
          .join("\n\n=====\n\n");

        if (hitCount === 0) {
          throw new Error(
            "Tavily không trả kết quả nào — kiểm tra TAVILY_API_KEY hoặc thử topic khác.",
          );
        }
        if (uniqueUrls.size < 3) {
          throw new Error(
            `Chưa đủ ≥3 nguồn độc lập (chỉ ${uniqueUrls.size} URL). Đổi chủ đề hoặc thử lại Research.`,
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

      // Phase 2: Verification + Synthesis → Research Brief (bước 3–4 OP)
      const memory = await getEditorialMemory(article.domain);
      const searchBlob = clipText(existingBrief.replace(SEARCH_MARK, "").trim(), 10_000);
      const previousGateFail =
        gateRetryCount(article.insightGate) > 0
          ? stripPipelineMarks(article.insightGate)
          : null;
      const llmStarted = Date.now();
      const researchBrief = await chatCompletion(
        [
          { role: "system", content: getSystemPrompt(article.domain) },
          {
            role: "user",
            content: buildDailyTaskPrompt({
              domain: article.domain,
              topic: article.topic ?? undefined,
              editorialMemory: clipText(memory, 2_500),
            }),
          },
          {
            role: "user",
            content: buildResearchPrompt(topic, searchBlob, { previousGateFail }),
          },
        ],
        { maxTokens: 3500 },
      );

      const updated = await prisma.article.update({
        where: { id: articleId },
        data: {
          researchBrief,
          currentStep: WorkflowStep.INSIGHT,
          status: ArticleStatus.DRAFT,
          errorMessage: null,
        },
      });
      return withTimings(updated, {
        searchMs: 0,
        llmMs: Date.now() - llmStarted,
        researchPhase: "llm",
      });
    }

    if (step === WorkflowStep.INSIGHT) {
      const phase = insightPhaseOf(article.insightGate);

      // Gate: L0–L3 + 3 test (giữa Synthesis → Decision)
      if (phase === "gate") {
        const llmStarted = Date.now();
        const insightGate = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "insight-a",
                appendContext(clipText(article.researchBrief, 5_000), `Chủ đề: ${topic}`),
              ),
            },
          ],
          { maxTokens: 1200, temperature: 0.35, reasoningEffort: "low" },
        );

        if (failedInsightGate(insightGate)) {
          const retries = gateRetryCount(article.insightGate);
          const nextRetry = retries + 1;

          // Hết lượt research lại → FAILED
          if (nextRetry > MAX_GATE_RESEARCH_RETRIES) {
            const failed = await prisma.article.update({
              where: { id: articleId },
              data: {
                insightGate: withGateRetryMark(retries, insightGate.trim()),
                status: ArticleStatus.FAILED,
                currentStep: WorkflowStep.INSIGHT,
                errorMessage:
                  `Cổng Insight vẫn < L2 sau ${MAX_GATE_RESEARCH_RETRIES} lần nghiên cứu lại. Đổi chủ đề/góc hoặc Làm lại từ đầu.`,
              },
            });
            return withTimings(failed, {
              llmMs: Date.now() - llmStarted,
              insightPhase: "gate-fail",
            });
          }

          // Quay Research: clear brief, giữ phản hồi Gate để đào góc sắc hơn
          const retried = await prisma.article.update({
            where: { id: articleId },
            data: {
              insightGate: withGateRetryMark(
                nextRetry,
                `## Gate lần trước — CHƯA ĐẠT ≥ L2\n\n${insightGate.trim()}`,
              ),
              researchBrief: null,
              draft12: null,
              factCheck: null,
              knowledgeRecord: null,
              cleanPublish: null,
              heroBrief: null,
              currentStep: WorkflowStep.RESEARCH,
              status: ArticleStatus.DRAFT,
              errorMessage: `Gate < L2 — nghiên cứu lại góc sắc hơn (lần ${nextRetry}/${MAX_GATE_RESEARCH_RETRIES}).`,
            },
          });
          return withTimings(retried, {
            llmMs: Date.now() - llmStarted,
            insightPhase: "gate-retry",
          });
        }

        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            insightGate: withGateRetryMark(
              gateRetryCount(article.insightGate),
              `${insightGate.trim()}\n\n${INSIGHT_GATE_MARK}`,
            ),
            currentStep: WorkflowStep.INSIGHT,
            status: ArticleStatus.DRAFT,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          insightPhase: "gate",
        });
      }

      // Decision (bước 5) — context mỏng: timeout thường do Research Brief + reasoning, không do output
      if (phase === "decision") {
        const llmStarted = Date.now();
        const gateOnly = stripPipelineMarks(article.insightGate);
        const decision = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "insight-decision",
                appendContext(
                  clipText(gateOnly, 1_200),
                  clipText(article.researchBrief, 1_200),
                  `Chủ đề: ${topic}`,
                  "Trả lời bullet ngắn ≤200 từ. Không nhắc lại Research / Gate tests.",
                ),
              ),
            },
          ],
          { maxTokens: 700, temperature: 0.3, reasoningEffort: "low" },
        );

        const merged = `${gateOnly}\n\n---\n\n${decision.trim()}\n\n${INSIGHT_DECISION_MARK}`;
        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            insightGate: merged,
            currentStep: WorkflowStep.INSIGHT,
            status: ArticleStatus.DRAFT,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          insightPhase: "decision",
        });
      }

      // Planning (bước 6)
      if (phase === "planning") {
        const llmStarted = Date.now();
        const soFar = stripPipelineMarks(article.insightGate);
        const planning = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "insight-planning",
                appendContext(
                  clipText(soFar, 1_800),
                  clipText(article.researchBrief, 2_000),
                  `Chủ đề: ${topic}`,
                ),
              ),
            },
          ],
          { maxTokens: 1400, temperature: 0.35, reasoningEffort: "low" },
        );

        const merged = `${soFar}\n\n---\n\n${planning.trim()}\n\n${INSIGHT_DONE_MARK}`;
        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            insightGate: merged,
            currentStep: WorkflowStep.WRITE,
            status: ArticleStatus.DRAFT,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          insightPhase: "planning",
        });
      }

      // Đã xong insight → sang Write
      const updated = await prisma.article.update({
        where: { id: articleId },
        data: {
          insightGate: article.insightGate?.includes(INSIGHT_DONE_MARK)
            ? article.insightGate
            : `${stripPipelineMarks(article.insightGate)}\n\n${INSIGHT_DONE_MARK}`,
          currentStep: WorkflowStep.WRITE,
          status: ArticleStatus.DRAFT,
          errorMessage: null,
        },
      });
      return withTimings(updated, { insightPhase: "skip" });
    }

    if (step === WorkflowStep.WRITE) {
      const draft = article.draft12 ?? "";

      // Phase A: chưa có nháp
      if (!draft.trim()) {
        const llmStarted = Date.now();
        const partA = await chatCompletion(
          [
            { role: "system", content: getSystemPrompt(article.domain) },
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
          { maxTokens: 3500 },
        );

        if (!partA.trim()) {
          throw new Error("Viết nửa đầu trả về rỗng — chạy lại bước Viết bài");
        }
        assertWritePhaseQuality(partA, "a");
        const cleanA = sanitizeEditorialBody(partA);

        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            draft12: `${cleanA}\n\n${WRITE_HALF_MARK}`,
            currentStep: WorkflowStep.WRITE,
            status: ArticleStatus.DRAFT,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          writePhase: "a",
        });
      }

      // Phase B: đã có nửa đầu
      if (draft.includes(WRITE_HALF_MARK) && !draft.includes(WRITE_DONE_MARK)) {
        const llmStarted = Date.now();
        const partA = sanitizeEditorialBody(stripPipelineMarks(draft));
        const partB = await chatCompletion(
          [
            { role: "system", content: getSystemPrompt(article.domain) },
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
          { maxTokens: 3500 },
        );

        if (!partB.trim()) {
          throw new Error("Viết nửa sau trả về rỗng — chạy lại bước Viết bài");
        }
        assertWritePhaseQuality(partB, "b");
        const merged = sanitizeEditorialBody(`${partA}\n\n${partB.trim()}`);
        assertFullDraftQuality(merged);

        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            draft12: `${merged}\n\n${WRITE_DONE_MARK}`,
            currentStep: WorkflowStep.FINALIZE,
            status: ArticleStatus.DRAFT,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          writePhase: "b",
        });
      }

      // Đã có nháp đủ → sang Finalize (không ghi đè)
      const updated = await prisma.article.update({
        where: { id: articleId },
        data: {
          draft12: draft.includes(WRITE_DONE_MARK) ? draft : `${stripPipelineMarks(draft)}\n\n${WRITE_DONE_MARK}`,
          currentStep: WorkflowStep.FINALIZE,
          status: ArticleStatus.DRAFT,
          errorMessage: null,
        },
      });
      return withTimings(updated, { writePhase: "skip" });
    }

    if (step === WorkflowStep.FINALIZE) {
      const finPhase = finalizePhaseOf(article);

      // Bước 8: Review — lưu tạm vào knowledgeRecord + REVIEW_DONE_MARK
      if (finPhase === "review") {
        const llmStarted = Date.now();
        const reviewOut = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-review",
                appendContext(
                  clipText(article.insightGate, 1_200),
                  clipText(stripPipelineMarks(article.draft12), 7_000),
                  `Chủ đề: ${topic}`,
                ),
              ),
            },
          ],
          { maxTokens: 2200, temperature: 0.35, reasoningEffort: "low" },
        );

        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            knowledgeRecord: `${reviewOut.trim()}\n\n${REVIEW_DONE_MARK}`,
            currentStep: WorkflowStep.FINALIZE,
            status: ArticleStatus.DRAFT,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: "review",
        });
      }

      // Bước 9: Fact Check
      if (finPhase === "fact") {
        const llmStarted = Date.now();
        const finalizeA = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-a",
                appendContext(
                  clipText(article.researchBrief, 2_500),
                  clipText(article.insightGate, 1_000),
                  clipText(stripPipelineMarks(article.draft12), 6_000),
                  `Chủ đề: ${topic}`,
                ),
              ),
            },
          ],
          { maxTokens: 2500, temperature: 0.3, reasoningEffort: "low" },
        );

        const parsed = parseFullOutput(finalizeA);
        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            factCheck: parsed.factCheck ?? finalizeA,
            // Giữ Editorial Review (có REVIEW_DONE_MARK) đến khi Publish ghi Knowledge Record
            currentStep: WorkflowStep.FINALIZE,
            status: ArticleStatus.DRAFT,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: "fact",
        });
      }

      // Bước 10: Publish Ready — Knowledge Record + Bản sạch + Hero
      if (finPhase === "publish" || finPhase === "done") {
        if (finPhase === "done" && (article.cleanPublish ?? "").trim().length >= 80) {
          const updated = await prisma.article.update({
            where: { id: articleId },
            data: {
              status: ArticleStatus.PUBLISH_READY,
              currentStep: null,
              errorMessage: null,
            },
          });
          return withTimings(updated, { finalizePhase: "skip" });
        }

        const llmStarted = Date.now();
        const draftClean = stripPipelineMarks(article.draft12);
        const finalizeB = await chatCompletion(
          [
            { role: "system", content: getSystemPrompt(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-b",
                appendContext(
                  clipText(article.insightGate, 1_000),
                  clipText(draftClean, 7_000),
                  clipText(article.factCheck, 1_500),
                  `Chủ đề: ${topic}`,
                  "Bắt buộc có đúng dòng: === BẢN SẠCH ĐỂ ĐĂNG === rồi viết bài hoàn chỉnh bên dưới.",
                ),
              ),
            },
          ],
          { maxTokens: 4000 },
        );

        const parsed = parseFullOutput(appendContext(finalizeB));
        let cleanPublish = sanitizeEditorialBody(stripPipelineMarks(parsed.cleanPublish ?? ""));
        if (cleanPublish.length < 80) {
          const strippedOut = sanitizeEditorialBody(stripPipelineMarks(finalizeB));
          cleanPublish =
            strippedOut.length >= 80
              ? strippedOut
              : draftClean.length >= 80
                ? sanitizeEditorialBody(draftClean)
                : "";
        }
        if (cleanPublish.length < 80) {
          throw new Error(
            "Publish Ready không tạo được Bản sạch (quá ngắn). Chạy lại bước Rà soát hoặc xem tab 12 phần.",
          );
        }

        const selfCheck = editorialSelfCheck({
          researchBrief: article.researchBrief,
          insightGate: article.insightGate,
          draft12: draftClean,
          cleanPublish,
          factCheck: article.factCheck,
        });

        const knowledgeRecord =
          parsed.knowledgeRecord ??
          (article.knowledgeRecord?.includes(REVIEW_DONE_MARK)
            ? null
            : article.knowledgeRecord);

        if (selfCheck.length > 0) {
          const detail = selfCheck.map((i) => i.message).join(" · ");
          const updated = await prisma.article.update({
            where: { id: articleId },
            data: {
              cleanPublish,
              heroBrief: parsed.heroBrief,
              knowledgeRecord: knowledgeRecord ?? article.knowledgeRecord,
              title: stripInsightLevelLabels(
                cleanPublish.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? article.topic ?? "Untitled",
              ),
              draft12: article.draft12?.includes(WRITE_DONE_MARK)
                ? article.draft12
                : `${sanitizeEditorialBody(draftClean)}\n\n${WRITE_DONE_MARK}`,
              status: ArticleStatus.DRAFT,
              currentStep: WorkflowStep.FINALIZE,
              errorMessage: `Self-check AI-TFES chưa đạt: ${detail}`.slice(0, 500),
            },
          });
          return withTimings(updated, {
            llmMs: Date.now() - llmStarted,
            finalizePhase: "self-check-fail",
          });
        }

        const titleMatch = cleanPublish.match(/^#\s+(.+)$/m);
        const title = stripInsightLevelLabels(
          titleMatch?.[1]?.trim() ?? article.topic ?? "Untitled",
        );

        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            factCheck: article.factCheck,
            knowledgeRecord:
              knowledgeRecord ??
              (stripPipelineMarks(article.knowledgeRecord) || null),
            cleanPublish,
            heroBrief: parsed.heroBrief,
            title,
            draft12: article.draft12?.includes(WRITE_DONE_MARK)
              ? article.draft12
              : `${sanitizeEditorialBody(draftClean)}\n\n${WRITE_DONE_MARK}`,
            status: ArticleStatus.PUBLISH_READY,
            currentStep: null,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: "publish",
        });
      }
    }

    throw new Error(`Bước không hợp lệ: ${step}`);
  } catch (error) {
    const { redactSecrets } = await import("@/lib/http-client");
    const raw = error instanceof Error ? error.message : "Lỗi không xác định";
    const isTimeout = /timed? ?out|timeout|Request timed out|Hobby chỉ cho/i.test(raw);
    const isQuality =
      /quá ngắn|sáo ngữ|bịa|Self-check|≥3 nguồn|≥450|≥350|khi nào KHÔNG|BAR VIẾT/i.test(raw);
    // Timeout / chất lượng: giữ Đang soạn để chạy lại bước
    await prisma.article.update({
      where: { id: articleId },
      data: {
        status: isTimeout || isQuality ? ArticleStatus.DRAFT : ArticleStatus.FAILED,
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
