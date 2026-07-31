import { ArticleStatus, WorkflowStep, type Article } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { chatCompletion } from "@/lib/nvidia";
import { pickFreshTopic, getAutoWriteConfig } from "@/lib/auto-write/runner";
import { formatSearchResults, webSearch } from "@/lib/search";
import {
  appendContext,
  CLEAN_POLISH_MARK,
  clipText,
  gateRetryCount,
  INSIGHT_DECISION_MARK,
  INSIGHT_DONE_MARK,
  INSIGHT_GATE_MARK,
  parseFullOutput,
  READER_SIM_DONE_MARK,
  READER_SIM_RETRY_RE,
  readerSimRetryCount,
  REVIEW_DONE_MARK,
  stripPipelineMarks,
  withGateRetryMark,
  withReaderSimRetryMark,
  WRITE_DONE_MARK,
  WRITE_HALF_MARK,
} from "@/lib/tfes/parser";
import {
  assertCleanPublishQuality,
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
  toReaderCleanPublish,
} from "@/lib/publish-content";
import {
  formatWritingPrefsPrompt,
  resolveWritingPrefs,
  type WritingPrefs,
} from "@/lib/tfes/writing-prefs";

/** Câu placeholder từng bị nhầm thành topic khi tạo bài không nhập chủ đề */
function isPlaceholderTopic(topic: string | null | undefined): boolean {
  const t = (topic ?? "").trim();
  if (!t) return true;
  return /seed_topics|domain profile|Seeding Mode|tự chọn theo|ưu tiên seed/i.test(t);
}

async function writingPrefsForArticle(article: {
  targetWordCount?: number | null;
  avoidFormats?: string | null;
}): Promise<WritingPrefs> {
  const config = await getAutoWriteConfig();
  return resolveWritingPrefs({
    targetWordCount: article.targetWordCount,
    avoidFormats: article.avoidFormats,
    defaultTargetWordCount: config.defaultTargetWordCount,
    defaultAvoidFormats: config.defaultAvoidFormats,
  });
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
/** Reader Sim fail → polish lại tối đa 1 lần rồi vẫn đưa người duyệt */
const MAX_READER_SIM_RETRIES = 1;

function readerRolesForDomain(domain: string): string {
  if (domain === "soft-skills") {
    return `Roles (soft-skills): **Engineer (IC)** · **Tech Lead** · **Engineering Manager**
Góc đọc: hội thoại/hành vi có điều kiện, không self-help sáo; có lúc KHÔNG nên áp dụng.`;
  }
  return `Roles (engineering): **Junior Engineer** · **Senior Engineer** · **Tech Lead**
Góc đọc: cơ chế/ràng buộc cụ thể; insight không hiển nhiên; có trade-off thật.`;
}

function readerSimFailed(text: string): boolean {
  if (/KẾT\s*LUẬN\s*:\s*ĐẠT\b/i.test(text) && !/KẾT\s*LUẬN\s*:\s*CHƯA\s*ĐẠT/i.test(text)) {
    return false;
  }
  if (/KẾT\s*LUẬN\s*:\s*CHƯA\s*ĐẠT/i.test(text)) return true;
  // Không có kết luận rõ → coi như chưa đạt (ép model ghi đúng dòng)
  return true;
}

function stripReaderSimSection(kr: string): string {
  return stripPipelineMarks(kr)
    .replace(/\n+##\s*Reader Simulation[\s\S]*$/i, "")
    .replace(READER_SIM_RETRY_RE, "")
    .trim();
}

function finalizePhaseOf(article: {
  knowledgeRecord?: string | null;
  factCheck?: string | null;
  cleanPublish?: string | null;
  errorMessage?: string | null;
}): "review" | "fact" | "publish" | "polish" | "reader-sim" | "done" {
  const kr = article.knowledgeRecord ?? "";
  const fc = article.factCheck ?? "";
  const clean = (article.cleanPublish ?? "").trim();
  const reviewDone = kr.includes(REVIEW_DONE_MARK) || Boolean(fc.trim());
  if (!reviewDone) return "review";
  if (!fc.trim()) return "fact";
  if (clean.length < 80) return "publish";
  // Reader Sim fail → polish lại kèm feedback
  if (article.errorMessage && /Reader Sim chưa đạt/i.test(article.errorMessage)) {
    return "polish";
  }
  // Polish fail → chạy lại 10b; các lỗi bản sạch khác → viết lại Publish
  if (article.errorMessage && /Polish self-check/i.test(article.errorMessage)) {
    return "polish";
  }
  if (
    article.errorMessage &&
    /Self-check|listicle|Bản sạch|outline|BAR VIẾT|khi nào không nên/i.test(article.errorMessage)
  ) {
    return "publish";
  }
  if (!clean.includes(CLEAN_POLISH_MARK)) return "polish";
  if (!kr.includes(READER_SIM_DONE_MARK)) return "reader-sim";
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
      const prefs = await writingPrefsForArticle(article);
      const prefsBlock = formatWritingPrefsPrompt(prefs);

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
                prefsBlock,
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
                prefsBlock,
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

      // Bước 10b: Polish bản sạch (một pass LLM) → PUBLISH_READY
      if (finPhase === "polish") {
        const prefs = await writingPrefsForArticle(article);
        const prefsBlock = formatWritingPrefsPrompt(prefs);
        const rawClean = stripPipelineMarks(article.cleanPublish);
        const llmStarted = Date.now();
        const polishedRaw = await chatCompletion(
          [
            { role: "system", content: getSystemPrompt(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-polish",
                appendContext(
                  clipText(rawClean, 8_000),
                  clipText(article.researchBrief, 2_000),
                  clipText(article.factCheck, 1_200),
                  `Chủ đề: ${topic}`,
                  "Chỉ xuất bài markdown hoàn chỉnh — không marker TFES, không Knowledge Record.",
                  article.errorMessage?.trim() && /Reader Sim chưa đạt/i.test(article.errorMessage)
                    ? `Phản hồi Reader Simulation cần sửa:\n${article.errorMessage.slice(0, 700)}`
                    : "",
                ),
                prefsBlock,
              ),
            },
          ],
          { maxTokens: 4000 },
        );

        let polished = toReaderCleanPublish(
          sanitizeEditorialBody(stripPipelineMarks(polishedRaw)),
        );
        if (polished.length < 80) {
          polished = toReaderCleanPublish(sanitizeEditorialBody(rawClean));
        }
        if (polished.length < 80) {
          throw new Error("Polish bản sạch thất bại (quá ngắn). Chạy lại Publish Ready.");
        }
        assertCleanPublishQuality(polished, prefs);

        const polishCheck = editorialSelfCheck({
          researchBrief: article.researchBrief,
          insightGate: article.insightGate,
          draft12: stripPipelineMarks(article.draft12),
          cleanPublish: polished,
          factCheck: article.factCheck,
          writingPrefs: prefs,
        });
        if (polishCheck.length > 0) {
          const detail = polishCheck.map((i) => i.message).join(" · ");
          const updated = await prisma.article.update({
            where: { id: articleId },
            data: {
              cleanPublish: polished,
              status: ArticleStatus.DRAFT,
              currentStep: WorkflowStep.FINALIZE,
              errorMessage: `Polish self-check chưa đạt: ${detail}`.slice(0, 500),
            },
          });
          return withTimings(updated, {
            llmMs: Date.now() - llmStarted,
            finalizePhase: "self-check-fail",
          });
        }

        const title = stripInsightLevelLabels(
          polished.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? article.topic ?? "Untitled",
        );

        // Viết lại Hero Brief từ bản sạch đã polish (tránh prompt generic lệch bài)
        const heroRaw = await chatCompletion(
          [
            { role: "system", content: getSystemPrompt(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-hero",
                appendContext(
                  clipText(polished, 2_800),
                  `Title: ${title}`,
                  `Chủ đề: ${topic}`,
                ),
              ),
            },
          ],
          { maxTokens: 500 },
        );
        const heroParsed = parseFullOutput(appendContext(heroRaw));
        const heroBrief =
          heroParsed.heroBrief?.trim() ||
          ( /HERO IMAGE BRIEF/i.test(heroRaw) ? heroRaw.trim() : null) ||
          article.heroBrief;

        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            cleanPublish: `${polished}\n\n${CLEAN_POLISH_MARK}`,
            title,
            heroBrief,
            status: ArticleStatus.DRAFT,
            currentStep: WorkflowStep.FINALIZE,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: "polish",
        });
      }

      // Bước 10c: Reader Simulation → PUBLISH_READY
      if (finPhase === "reader-sim") {
        const llmStarted = Date.now();
        const cleanBody = toReaderCleanPublish(stripPipelineMarks(article.cleanPublish));
        const domain = article.domain === "soft-skills" ? "soft-skills" : "engineering";
        const simRaw = await chatCompletion(
          [
            { role: "system", content: getSystemPrompt(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-reader-sim",
                appendContext(
                  readerRolesForDomain(domain),
                  clipText(cleanBody, 5_500),
                  `Title: ${article.title || topic}`,
                  `Chủ đề: ${topic}`,
                ),
              ),
            },
          ],
          { maxTokens: 900 },
        );

        const simOut = stripPipelineMarks(simRaw).trim();
        const retries = readerSimRetryCount(article.knowledgeRecord);
        const failed = readerSimFailed(simOut);

        if (failed && retries < MAX_READER_SIM_RETRIES) {
          const feedback = simOut.slice(0, 600);
          const krBase = stripReaderSimSection(article.knowledgeRecord ?? "");
          const krNext = withReaderSimRetryMark(
            retries + 1,
            `${krBase}\n\n## Reader Simulation\n${simOut}`.trim(),
          );
          // Xóa polish mark → tick sau chạy lại polish kèm feedback
          const cleanWithoutPolish = stripPipelineMarks(article.cleanPublish);
          const updated = await prisma.article.update({
            where: { id: articleId },
            data: {
              cleanPublish: cleanWithoutPolish,
              knowledgeRecord: krNext,
              status: ArticleStatus.DRAFT,
              currentStep: WorkflowStep.FINALIZE,
              errorMessage: `Reader Sim chưa đạt: ${feedback}`.slice(0, 500),
            },
          });
          return withTimings(updated, {
            llmMs: Date.now() - llmStarted,
            finalizePhase: "reader-sim-fail",
          });
        }

        const krBase = stripReaderSimSection(article.knowledgeRecord ?? "");
        const krFinal = `${krBase}\n\n## Reader Simulation\n${simOut}\n\n${READER_SIM_DONE_MARK}`.trim();
        const updated = await prisma.article.update({
          where: { id: articleId },
          data: {
            knowledgeRecord: krFinal,
            cleanPublish: article.cleanPublish?.includes(CLEAN_POLISH_MARK)
              ? article.cleanPublish
              : `${cleanBody}\n\n${CLEAN_POLISH_MARK}`,
            status: ArticleStatus.PUBLISH_READY,
            currentStep: null,
            errorMessage: null,
          },
        });
        return withTimings(updated, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: failed ? "reader-sim-soft" : "reader-sim",
        });
      }

      // Bước 10: Publish Ready — Knowledge Record + Bản sạch + Hero Brief
      if (finPhase === "publish" || finPhase === "done") {
        const prefs = await writingPrefsForArticle(article);
        const prefsBlock = formatWritingPrefsPrompt(prefs);

        if (finPhase === "done" && (article.cleanPublish ?? "").trim().length >= 80) {
          try {
            const cleanedExisting = toReaderCleanPublish(article.cleanPublish!);
            assertCleanPublishQuality(cleanedExisting, prefs);
            const skipCheck = editorialSelfCheck({
              researchBrief: article.researchBrief,
              insightGate: article.insightGate,
              draft12: stripPipelineMarks(article.draft12),
              cleanPublish: cleanedExisting,
              factCheck: article.factCheck,
              writingPrefs: prefs,
            });
            if (skipCheck.length === 0) {
              const marked = cleanedExisting.includes(CLEAN_POLISH_MARK)
                ? cleanedExisting
                : `${cleanedExisting}\n\n${CLEAN_POLISH_MARK}`;
              const kr = article.knowledgeRecord ?? "";
              if (!kr.includes(READER_SIM_DONE_MARK)) {
                // Đã polish nhưng chưa Reader Sim — không skip lên PUBLISH_READY
                const updated = await prisma.article.update({
                  where: { id: articleId },
                  data: {
                    cleanPublish: marked,
                    status: ArticleStatus.DRAFT,
                    currentStep: WorkflowStep.FINALIZE,
                    errorMessage: null,
                  },
                });
                return withTimings(updated, { finalizePhase: "await-reader-sim" });
              }
              const updated = await prisma.article.update({
                where: { id: articleId },
                data: {
                  cleanPublish: marked,
                  status: ArticleStatus.PUBLISH_READY,
                  currentStep: null,
                  errorMessage: null,
                },
              });
              return withTimings(updated, { finalizePhase: "skip" });
            }
          } catch {
            /* Bản sạch cũ không đạt — viết lại bên dưới */
          }
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
                  article.errorMessage?.trim()
                    ? `Lần Publish trước chưa đạt: ${article.errorMessage.slice(0, 400)} — viết lại liền mạch đọc được, sửa đúng lỗi đó.`
                    : "",
                ),
                prefsBlock,
              ),
            },
          ],
          { maxTokens: 4000 },
        );

        const parsed = parseFullOutput(appendContext(finalizeB));
        let cleanPublish = toReaderCleanPublish(
          sanitizeEditorialBody(stripPipelineMarks(parsed.cleanPublish ?? "")),
        );
        if (cleanPublish.length < 80) {
          const strippedOut = toReaderCleanPublish(
            sanitizeEditorialBody(stripPipelineMarks(finalizeB)),
          );
          cleanPublish =
            strippedOut.length >= 80
              ? strippedOut
              : draftClean.length >= 80
                ? toReaderCleanPublish(sanitizeEditorialBody(draftClean))
                : "";
        }
        if (cleanPublish.length < 80) {
          throw new Error(
            "Publish Ready không tạo được Bản sạch (quá ngắn). Chạy lại bước Rà soát hoặc xem tab 12 phần.",
          );
        }
        assertCleanPublishQuality(cleanPublish, prefs);

        const selfCheck = editorialSelfCheck({
          researchBrief: article.researchBrief,
          insightGate: article.insightGate,
          draft12: draftClean,
          cleanPublish,
          factCheck: article.factCheck,
          writingPrefs: prefs,
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

        // Giữ DRAFT để tick tiếp chạy polish (10b) — tránh timeout gộp 2 LLM
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
            status: ArticleStatus.DRAFT,
            currentStep: WorkflowStep.FINALIZE,
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
      /quá ngắn|sáo ngữ|bịa|Self-check|≥3 nguồn|≥450|≥350|khi nào KHÔNG|BAR VIẾT|listicle|Bản sạch|outline|heading biên tập|không phù hợp|điều kiện\/phản biện/i.test(
        raw,
      );
    // Listicle ở nửa đầu → viết lại Write A
    const isListicleRewrite = /listicle|outline listicle/i.test(raw);
    // Bản sạch fail → chỉ xóa cleanPublish, giữ nháp 12 phần + FINALIZE
    const isCleanPublishFail =
      /Bản sạch|heading biên tập|điều kiện\/phản biện|markdown table|Mermaid|gạch ngang/i.test(raw) &&
      !isListicleRewrite;

    await prisma.article.update({
      where: { id: articleId },
      data: {
        status: isTimeout || isQuality ? ArticleStatus.DRAFT : ArticleStatus.FAILED,
        errorMessage: redactSecrets(raw).slice(0, 500),
        ...(isListicleRewrite
          ? {
              draft12: null,
              currentStep: WorkflowStep.WRITE,
            }
          : isCleanPublishFail
            ? {
                cleanPublish: null,
                currentStep: WorkflowStep.FINALIZE,
              }
            : {}),
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

export async function approveArticle(
  articleId: string,
  notes?: string,
  opts?: { allowWithoutHero?: boolean },
): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });

  if (article.status !== ArticleStatus.PUBLISH_READY) {
    throw new Error("Chỉ duyệt bài ở trạng thái Publish Ready");
  }

  if (!article.heroImageUrl?.trim() && !opts?.allowWithoutHero) {
    throw new Error(
      "Chưa có hero image — gen ảnh (FLUX/Qwen) trước khi duyệt, hoặc chọn «Duyệt không ảnh».",
    );
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
