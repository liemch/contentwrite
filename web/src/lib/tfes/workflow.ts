import { ArticleStatus, WorkflowStep, type Article } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { chatCompletion } from "@/lib/nvidia";
import { pickFreshTopic, getAutoWriteConfig } from "@/lib/auto-write/runner";
import { formatSearchResults, webSearch } from "@/lib/search";
import {
  appendContext,
  CLEAN_POLISH_MARK,
  clipText,
  extractEditorialReview,
  gateRetryCount,
  INSIGHT_DECISION_MARK,
  INSIGHT_DONE_MARK,
  INSIGHT_GATE_MARK,
  mergeKnowledgeWithPriorReview,
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
  applyDeterministicCleanFixes,
  buildCleanRepairDirectives,
  cleanGenMaxTokens,
  cleanWordBounds,
  countWords,
  assertFullDraftQuality,
  assertWritePhaseQuality,
  editorialSelfCheck,
  hasDryOpener,
  isCleanBodyQualityFail,
  isCleanPublishQualityFail,
  isDryOpenerFail,
  isWritePhaseQualityFail,
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
import { readerRolesForDomain, resolveDomainId } from "@/lib/tfes/domains";
import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";
import { formatArticleShapePrompt } from "@/lib/tfes/article-shapes";
import { hydrateTfesOverrides } from "@/lib/tfes/tfes-docs";

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

function shapeBlockFor(articleId: string): string {
  return formatArticleShapePrompt(articleId);
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
      orderBy: [{ editorialScore: "desc" }, { publishedAt: "desc" }],
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
              `- ${r.title} | score ${r.editorialScore ?? "—"}/5 | ${r.category ?? "N/A"} | keywords: ${r.keywords ?? ""} | core: ${(r.coreMessage ?? "").slice(0, 80)}`,
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
/** Reader Sim fail → polish lại tối đa N lần rồi vẫn đưa người duyệt */
const MAX_READER_SIM_RETRIES = PIPELINE_CONFIG.retries.maxReaderSimRetries;

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

/** Block CONTEXT: góp ý bước trước — Fact / Publish / Polish phải đọc */
function priorPipelineSupportBlock(article: {
  knowledgeRecord?: string | null;
  factCheck?: string | null;
  errorMessage?: string | null;
  includeFact?: boolean;
}): string {
  const parts: string[] = [];
  const review = extractEditorialReview(article.knowledgeRecord);
  if (review.trim()) {
    parts.push(
      `### Editorial Review (bước 8) — BẮT BUỘC xử lý các Fail / Minor–Major dưới đây\n${clipText(review, 2_400)}`,
    );
  }
  if (article.includeFact !== false && (article.factCheck ?? "").trim()) {
    parts.push(
      `### Fact-Check Ledger (bước 9) — chỉnh số liệu / wording khớp verdict\n${clipText(article.factCheck, 1_600)}`,
    );
  }
  if (article.errorMessage?.trim() && /Reader Sim chưa đạt/i.test(article.errorMessage)) {
    parts.push(
      `### Reader Simulation — sửa đúng các điểm này\n${clipText(article.errorMessage, 700)}`,
    );
  } else if (article.errorMessage?.trim() && isCleanPublishQualityFail(article.errorMessage)) {
    parts.push(
      `### Lỗi chất lượng bản sạch (lần trước) — BẮT BUỘC sửa đúng điểm này, không lặp lại\n${clipText(article.errorMessage, 700)}`,
    );
  }
  return parts.join("\n\n");
}

/**
 * Chấm bản sạch; fail → sửa máy → LLM repair (chỉ thị theo lỗi) → nếu còn fail: 1 pass targeted nữa.
 */
async function ensureCleanPublishQuality(input: {
  clean: string;
  prefs: WritingPrefs;
  topic: string;
  domain: string | null | undefined;
  articleId: string;
  researchBrief?: string | null;
  factCheck?: string | null;
  qualityHint?: string | null;
}): Promise<string> {
  let clean = input.clean;
  try {
    assertCleanPublishQuality(clean, input.prefs);
    return clean;
  } catch (first) {
    const hint =
      (first instanceof Error ? first.message : String(first)) ||
      input.qualityHint ||
      "Quality gate fail";

    // 1) Sửa máy trước (table / % / --- / Subtitle / alt) — tránh soft-retry vòng với cùng lỗi
    clean = applyDeterministicCleanFixes(clean, input.prefs);
    try {
      assertCleanPublishQuality(clean, input.prefs);
      return clean;
    } catch (afterDeterministic) {
      const hint2 =
        afterDeterministic instanceof Error
          ? afterDeterministic.message
          : String(afterDeterministic);
      const activeHint = hint2 || hint;

      const prefsBlock = formatWritingPrefsPrompt(input.prefs);
      const directives = buildCleanRepairDirectives(activeHint, clean);

      const repairedRaw = await chatCompletion(
        [
          { role: "system", content: getSystemPrompt(input.domain ?? "engineering") },
          {
            role: "user",
            content: buildPipelinePrompt(
              "finalize-repair",
              appendContext(
                clipText(clean, 18_000),
                clipText(input.researchBrief, 2_000),
                clipText(input.factCheck, 1_200),
                `Chủ đề: ${input.topic}`,
                `LỖI MÁY CHẤM (sửa đúng):\n${activeHint.slice(0, 700)}`,
                directives,
              ),
              prefsBlock,
              shapeBlockFor(input.articleId),
            ),
          },
        ],
        { maxTokens: cleanGenMaxTokens(input.prefs.targetWordCount) },
      );
      const repaired = toReaderCleanPublish(
        sanitizeEditorialBody(stripPipelineMarks(repairedRaw)),
      );
      if (repaired.length >= 80) clean = repaired;
      clean = applyDeterministicCleanFixes(clean, input.prefs);

      try {
        assertCleanPublishQuality(clean, input.prefs);
        return clean;
      } catch (still) {
        const stillHint =
          still instanceof Error ? still.message : String(still);
        const focus =
          buildCleanRepairDirectives(stillHint, clean) ||
          (isDryOpenerFail(stillHint) || hasDryOpener(clean)
            ? "CHỈ SỬA ĐOẠN MỞ: cảnh hoặc nghịch lý; CẤM Trong môi trường/bối cảnh/Ngày nay."
            : `Sửa đúng: ${stillHint.slice(0, 400)}`);

        const pass2Raw = await chatCompletion(
          [
            {
              role: "system",
              content: getSystemPromptLite(input.domain ?? "engineering"),
            },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-repair",
                appendContext(
                  clipText(clean, 18_000),
                  clipText(input.researchBrief, 1_500),
                  `Chủ đề: ${input.topic}`,
                  `VẪN FAIL SAU LẦN SỬA TRƯỚC:\n${stillHint.slice(0, 500)}`,
                  focus,
                  "Giữ title + luận điểm chính. Xuất lại TOÀN BỘ bài markdown.",
                ),
                prefsBlock,
                shapeBlockFor(input.articleId),
              ),
            },
          ],
          { maxTokens: cleanGenMaxTokens(input.prefs.targetWordCount) },
        );
        const pass2 = toReaderCleanPublish(
          sanitizeEditorialBody(stripPipelineMarks(pass2Raw)),
        );
        if (pass2.length >= 80) clean = pass2;
        clean = applyDeterministicCleanFixes(clean, input.prefs);
        assertCleanPublishQuality(clean, input.prefs);
        return clean;
      }
    }
  }
}

/**
 * Nếu bản sạch thiếu số TỪ so với aim (~85% target) — một pass expand (không xoá bài).
 * Đếm từ = khoảng trắng, không phải ký tự.
 */
async function expandCleanIfShort(input: {
  clean: string;
  prefs: WritingPrefs;
  topic: string;
  domain: string | null | undefined;
  articleId: string;
  researchBrief?: string | null;
}): Promise<string> {
  const { target, aimWords, minWords } = cleanWordBounds(input.prefs);
  const words = countWords(input.clean);
  if (words >= aimWords) return input.clean;

  const need = Math.max(aimWords - words, minWords - words);
  const prefsBlock = formatWritingPrefsPrompt(input.prefs);
  const expandedRaw = await chatCompletion(
    [
      { role: "system", content: getSystemPrompt(input.domain ?? "engineering") },
      {
        role: "user",
        content: buildPipelinePrompt(
          "finalize-expand",
          appendContext(
            clipText(input.clean, 18_000),
            clipText(input.researchBrief, 2_000),
            `Chủ đề: ${input.topic}`,
            `Hiện có ~${words} từ (đếm khoảng trắng). Target ~${target} từ; cần ≥${aimWords} (sàn ${minWords}). Viết thêm khoảng ≥${need} từ vào thân — xuất lại TOÀN BÀI dài hơn.`,
          ),
          prefsBlock,
          shapeBlockFor(input.articleId),
        ),
      },
    ],
    { maxTokens: cleanGenMaxTokens(target) },
  );

  const expanded = toReaderCleanPublish(
    sanitizeEditorialBody(stripPipelineMarks(expandedRaw)),
  );
  if (expanded.length < 80) return input.clean;
  // Chỉ nhận nếu dài hơn rõ (tránh model rút gọn)
  if (countWords(expanded) > words + 80) return expanded;
  return input.clean;
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
  if (article.errorMessage && isCleanPublishQualityFail(article.errorMessage)) {
    return "polish";
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
  await hydrateTfesOverrides();

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
      const domain = resolveDomainId(article.domain);
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
              undefined,
              shapeBlockFor(articleId),
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
              undefined,
              shapeBlockFor(articleId),
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
              shapeBlockFor(articleId),
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
              shapeBlockFor(articleId),
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
              undefined,
              shapeBlockFor(articleId),
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
        const support = priorPipelineSupportBlock({
          knowledgeRecord: article.knowledgeRecord,
          includeFact: false,
        });
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
                  support,
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
        const { minWords, aimWords, target } = cleanWordBounds(prefs);
        const rawClean = stripPipelineMarks(article.cleanPublish);
        const fallbackClean = toReaderCleanPublish(sanitizeEditorialBody(rawClean));
        const support = priorPipelineSupportBlock(article);
        const llmStarted = Date.now();
        const polishedRaw = await chatCompletion(
          [
            { role: "system", content: getSystemPrompt(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-polish",
                appendContext(
                  clipText(rawClean, 18_000),
                  clipText(article.researchBrief, 2_000),
                  support,
                  `Chủ đề: ${topic}`,
                  "Chỉ xuất bài markdown hoàn chỉnh — không marker TFES, không Knowledge Record.",
                  `Độ dài = số TỪ (khoảng trắng), target ~${target} từ (aim ≥${aimWords}, sàn ≥${minWords}). Không rút synopsis.`,
                ),
                prefsBlock,
              shapeBlockFor(articleId),
            ),
            },
          ],
          { maxTokens: cleanGenMaxTokens(prefs.targetWordCount) },
        );

        let polished = toReaderCleanPublish(
          sanitizeEditorialBody(stripPipelineMarks(polishedRaw)),
        );
        // Polish bị cắt token / rút quá ngắn → giữ bản sạch trước đó nếu dài hơn
        if (
          polished.length < 80 ||
          countWords(polished) + 80 < countWords(fallbackClean)
        ) {
          polished = fallbackClean;
        }
        if (polished.length < 80) {
          throw new Error("Polish bản sạch thất bại (quá ngắn). Chạy lại Publish Ready.");
        }
        polished = await expandCleanIfShort({
          articleId,
          clean: polished,
          prefs,
          topic,
          domain: article.domain,
          researchBrief: article.researchBrief,
        });
        try {
          polished = await ensureCleanPublishQuality({
          articleId,
          clean: polished,
            prefs,
            topic,
            domain: article.domain,
            researchBrief: article.researchBrief,
            factCheck: article.factCheck,
            qualityHint: article.errorMessage,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await prisma.article.update({
            where: { id: articleId },
            data: {
              cleanPublish: polished.length >= 80 ? polished : article.cleanPublish,
              status: ArticleStatus.DRAFT,
              currentStep: WorkflowStep.FINALIZE,
              errorMessage: msg.slice(0, 500),
            },
          });
          throw err instanceof Error ? err : new Error(msg);
        }

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
        const domain = resolveDomainId(article.domain);
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
              undefined,
              shapeBlockFor(articleId),
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
        const priorReview = extractEditorialReview(article.knowledgeRecord);
        const support = priorPipelineSupportBlock(article);
        const finalizeB = await chatCompletion(
          [
            { role: "system", content: getSystemPrompt(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-b",
                appendContext(
                  clipText(article.insightGate, 1_000),
                  clipText(draftClean, 12_000),
                  support,
                  `Chủ đề: ${topic}`,
                  "Bắt buộc có đúng dòng: === BẢN SẠCH ĐỂ ĐĂNG === rồi viết bài hoàn chỉnh bên dưới.",
                  `Độ dài bản sạch ~${prefs.targetWordCount} TỪ (đếm khoảng trắng, không phải ký tự; sàn ≥${cleanWordBounds(prefs).minWords}, aim ≥${cleanWordBounds(prefs).aimWords}).`,
                  article.errorMessage?.trim()
                    ? `Lần Publish trước chưa đạt: ${article.errorMessage.slice(0, 400)} — viết lại liền mạch đọc được, sửa đúng lỗi đó.`
                    : "",
                ),
                prefsBlock,
              shapeBlockFor(articleId),
            ),
            },
          ],
          { maxTokens: cleanGenMaxTokens(prefs.targetWordCount) },
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
        cleanPublish = await expandCleanIfShort({
          articleId,
          clean: cleanPublish,
          prefs,
          topic,
          domain: article.domain,
          researchBrief: article.researchBrief,
        });
        try {
          cleanPublish = await ensureCleanPublishQuality({
          articleId,
          clean: cleanPublish,
            prefs,
            topic,
            domain: article.domain,
            researchBrief: article.researchBrief,
            factCheck: article.factCheck,
            qualityHint: article.errorMessage,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          await prisma.article.update({
            where: { id: articleId },
            data: {
              cleanPublish: cleanPublish.length >= 80 ? cleanPublish : article.cleanPublish,
              status: ArticleStatus.DRAFT,
              currentStep: WorkflowStep.FINALIZE,
              errorMessage: msg.slice(0, 500),
            },
          });
          throw err instanceof Error ? err : new Error(msg);
        }

        const selfCheck = editorialSelfCheck({
          researchBrief: article.researchBrief,
          insightGate: article.insightGate,
          draft12: draftClean,
          cleanPublish,
          factCheck: article.factCheck,
          writingPrefs: prefs,
        });

        // Giữ Review trong KR để Polish vẫn đọc được sau khi có Knowledge Record thật
        const knowledgeRecord = mergeKnowledgeWithPriorReview(
          parsed.knowledgeRecord ??
            (priorReview
              ? null
              : article.knowledgeRecord?.includes(REVIEW_DONE_MARK)
                ? null
                : article.knowledgeRecord),
          priorReview,
        );

        if (selfCheck.length > 0) {
          const detail = selfCheck.map((i) => i.message).join(" · ");
          const updated = await prisma.article.update({
            where: { id: articleId },
            data: {
              cleanPublish,
              heroBrief: parsed.heroBrief,
              knowledgeRecord: knowledgeRecord || article.knowledgeRecord,
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
              knowledgeRecord ||
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
      isCleanPublishQualityFail(raw) ||
      isWritePhaseQualityFail(raw) ||
      /bịa|≥3 nguồn|≥450|≥350|khi nào KHÔNG|công ty giả|reference nghi bịa/i.test(raw);
    // Listicle ở nửa đầu → viết lại Write A
    const isListicleRewrite = /listicle|outline listicle/i.test(raw);
    // Bản sạch fail → GIỮ cleanPublish để lần sau polish/sửa (không viết lại từ nháp rồi lặp lỗi)
    const isCleanPublishFail = isCleanBodyQualityFail(raw) && !isListicleRewrite;

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
  opts?: {
    allowWithoutHero?: boolean;
    editorialScore?: number;
    checklist?: string[];
  },
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

  const score =
    typeof opts?.editorialScore === "number" &&
    opts.editorialScore >= 1 &&
    opts.editorialScore <= 5
      ? Math.round(opts.editorialScore)
      : null;

  if (score == null) {
    throw new Error("Chọn điểm biên tập 1–5 trước khi duyệt");
  }

  if (!opts?.checklist || opts.checklist.length < 5) {
    throw new Error("Tick đủ checklist biên tập trước khi duyệt");
  }

  const checklistNote =
    opts?.checklist && opts.checklist.length > 0
      ? `Checklist OK: ${opts.checklist.join(", ")}`
      : "";
  const scoreNote = score != null ? `Điểm biên tập: ${score}/5` : "";
  const mergedNotes = [notes?.trim(), scoreNote, checklistNote].filter(Boolean).join("\n");

  const updated = await prisma.article.update({
    where: { id: articleId },
    data: {
      status: ArticleStatus.APPROVED,
      reviewerNotes: mergedNotes || null,
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
        editorialScore: score ?? undefined,
      },
      update: {
        title: article.title,
        coreMessage: article.knowledgeRecord ?? undefined,
        ...(score != null ? { editorialScore: score } : {}),
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
