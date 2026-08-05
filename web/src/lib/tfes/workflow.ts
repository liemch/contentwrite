import {
  ArtifactType,
  WorkflowState,
  WorkflowStep,
  type Article,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { extractArticleVisualContext } from "@/lib/image/hero-prompt";
import { chatCompletion } from "@/lib/nvidia";
import { pickFreshTopic, getAutoWriteConfig } from "@/lib/auto-write/runner";
import { formatSearchResults, webSearch } from "@/lib/search";
import {
  appendContext,
  CLEAN_POLISH_MARK,
  clipText,
  extractEditorialReview,
  gateRetryCount,
  HUMAN_EDIT_MARK,
  FINAL_REVIEW_DONE_MARK,
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
  bootstrapLegacyWorkflowState,
  deriveLegacyProjection,
  isWorkflowTerminal,
  latestArtifactRevision,
  patchWorkflowArticle,
  resetWorkflowArticle,
  transitionArticle,
} from "@/lib/tfes/state-machine";
import {
  assertFinalVerificationPassed,
  inspectFinalVerification,
} from "@/lib/tfes/final-verification";
import {
  MAX_FACT_REMEDIATION_RETRIES,
  verificationStatus,
} from "@/lib/tfes/fact-ledger";
import {
  MAX_FINAL_VERIFICATION_FORMAT_RETRIES,
  MAX_REVISION_REMEDIATION_RETRIES,
} from "@/lib/tfes/retry-policy";
import {
  applyHumanReviewToKnowledge,
  humanReviewSupportBlock,
  isAwaitingHumanReview,
  parseEditorialFindings,
  withHumanReviewPendingMark,
  type HumanReviewPayload,
} from "@/lib/tfes/human-review";
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
  rewriteStockOpenerDeterministic,
} from "@/lib/tfes/quality";
import { assertEngineeringGoldBar, inspectEngineeringGoldBar } from "@/lib/tfes/engineering-gold-bar";
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
import { auditResearchEvidence } from "@/lib/tfes/research-evidence";
import { bumpContentVersion, TFES_CONTRACT } from "@/lib/tfes/contract";
import { selectArticleShape } from "@/lib/tfes/article-shape-manager";
import {
  formatWritingPrefsPrompt,
  resolveWritingPrefs,
  type WritingPrefs,
} from "@/lib/tfes/writing-prefs";
import { readerRolesForDomain, resolveDomainId } from "@/lib/tfes/domains";
import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";
import { formatPublishShapePrompt } from "@/lib/tfes/publish-formats";
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

function shapeBlockFor(article: {
  id: string;
  publishFormat?: string | null;
  articleShapeId?: string | null;
  articleShapeSnapshot?: string | null;
}): string {
  return formatPublishShapePrompt({
    articleId: article.id,
    publishFormat: article.publishFormat,
    articleShapeId: article.articleShapeId,
    articleShapeSnapshot: article.articleShapeSnapshot,
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

async function getEditorialMemory(
  domain: string,
  seriesId?: string | null,
): Promise<string> {
  const { buildEditorialMemoryBlock } = await import("@/lib/tfes/editorial-memory");
  return buildEditorialMemoryBlock(domain, { seriesId });
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
  const human = humanReviewSupportBlock(article.knowledgeRecord);
  if (human.trim()) {
    parts.push(human);
  }
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
 * Engineering: thêm chuẩn vàng (anti-generic + thực tế) sau quality sạch.
 */
async function ensureCleanPublishQuality(input: {
  clean: string;
  prefs: WritingPrefs;
  topic: string;
  domain: string | null | undefined;
  articleId: string;
  publishFormat?: string | null;
  researchBrief?: string | null;
  factCheck?: string | null;
  qualityHint?: string | null;
}): Promise<string> {
  const assertCleanAndGold = (candidate: string) => {
    assertCleanPublishQuality(candidate, input.prefs);
    assertEngineeringGoldBar({
      domain: input.domain,
      body: candidate,
      researchBrief: input.researchBrief,
    });
  };

  let clean = input.clean;
  try {
    assertCleanAndGold(clean);
    return clean;
  } catch (first) {
    const hint =
      (first instanceof Error ? first.message : String(first)) ||
      input.qualityHint ||
      "Quality gate fail";

    // 1) Sửa máy trước (table / % / --- / Subtitle / alt) — tránh soft-retry vòng với cùng lỗi
    clean = applyDeterministicCleanFixes(clean, input.prefs);
    try {
      assertCleanAndGold(clean);
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
              shapeBlockFor({ id: input.articleId, publishFormat: input.publishFormat }),
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
        assertCleanAndGold(clean);
        return clean;
      } catch (still) {
        const stillHint =
          still instanceof Error ? still.message : String(still);
        const focus =
          buildCleanRepairDirectives(stillHint, clean) ||
          (isDryOpenerFail(stillHint) || hasDryOpener(clean)
            ? "CHỈ SỬA ĐOẠN MỞ: nghịch lý / failure+metric từ Research. CẤM Trong môi trường/bối cảnh/Ngày nay. CẤM “Trong một sprint…”, “đội … công ty fintech/startup”."
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
                shapeBlockFor({ id: input.articleId, publishFormat: input.publishFormat }),
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
        try {
          assertCleanAndGold(clean);
          return clean;
        } catch (last) {
          // Thoát loop opener: sửa máy đoạn mở lần cuối rồi chấm lại
          const lastHint = last instanceof Error ? last.message : String(last);
          if (isDryOpenerFail(lastHint) || hasDryOpener(clean)) {
            clean = rewriteStockOpenerDeterministic(clean);
            clean = applyDeterministicCleanFixes(clean, input.prefs);
            assertCleanAndGold(clean);
            return clean;
          }
          throw last instanceof Error ? last : new Error(lastHint);
        }
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
  publishFormat?: string | null;
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
          shapeBlockFor({ id: input.articleId, publishFormat: input.publishFormat }),
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
  workflowState?: WorkflowState;
}): "review" | "await-human" | "revision-remediate" | "fact-remediate" | "fact" | "final-verify" | "publish" | "polish" | "reader-sim" | "done" {
  const kr = article.knowledgeRecord ?? "";
  const fc = article.factCheck ?? "";
  const clean = (article.cleanPublish ?? "").trim();
  const reviewDone = kr.includes(REVIEW_DONE_MARK) || Boolean(fc.trim());
  if (isAwaitingHumanReview(article)) return "await-human";
  if (
    article.workflowState === WorkflowState.MINOR_REVISION_REQUIRED ||
    article.workflowState === WorkflowState.MAJOR_REVISION_REQUIRED ||
    article.workflowState === WorkflowState.REWRITE_REQUIRED
  ) return "revision-remediate";
  if (!reviewDone) return "review";
  if (article.workflowState === WorkflowState.FACT_CHECK_FAILED) return "fact-remediate";
  if (!fc.trim()) return "fact";
  if (!kr.includes(FINAL_REVIEW_DONE_MARK)) return "final-verify";
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
  await bootstrapLegacyWorkflowState(articleId);

  let article = await prisma.article.findUnique({ where: { id: articleId } });
  if (!article) {
    throw new Error("Không tìm thấy bài viết");
  }

  let cursor = {
    state: article.workflowState,
    version: article.workflowVersion,
  };
  const commitTransition = async (
    input: Omit<
      Parameters<typeof transitionArticle>[0],
      "articleId" | "expectedState" | "expectedVersion"
    >,
  ) => {
    const next = await transitionArticle({
      ...input,
      articleId,
      expectedState: cursor.state,
      expectedVersion: cursor.version,
    });
    cursor = { state: next.workflowState, version: next.workflowVersion };
    return next;
  };
  const commitPatch = async (
    input: Omit<
      Parameters<typeof patchWorkflowArticle>[0],
      "articleId" | "expectedState" | "expectedVersion"
    >,
  ) => {
    const next = await patchWorkflowArticle({
      ...input,
      articleId,
      expectedState: cursor.state,
      expectedVersion: cursor.version,
    });
    cursor = { state: next.workflowState, version: next.workflowVersion };
    return next;
  };

  if (isWorkflowTerminal(article.workflowState)) {
    throw new Error(`Workflow ${article.workflowState} không thể chạy pipeline`);
  }

  const step =
    deriveLegacyProjection(article.workflowState).currentStep ?? WorkflowStep.RESEARCH;

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
      article = await commitPatch({
        action: "select-topic",
        articlePatch: { topic, errorMessage: null },
      });
    }

    if (step === WorkflowStep.RESEARCH) {
      const SEARCH_MARK = "<!--TFES_SEARCH_BLOB-->";
      const existingBrief = article.researchBrief ?? "";

      // Phase 1: Tavily — ≥3 nguồn, có góc phản biện (AI-TFES)
      if (!existingBrief.includes(SEARCH_MARK)) {
        const memory = await getEditorialMemory(article.domain, article.seriesId);
        await commitTransition({
          to: WorkflowState.MEMORY_CHECKED,
          action: "memory-check",
          artifact: {
            type: ArtifactType.MEMORY_CHECK,
            content: memory || "Không có Knowledge Record gần đây.",
            domainProfileVersion: `${resolveDomainId(article.domain)}@1.6`,
          },
        });
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

        const transitioned = await commitTransition({
          to: WorkflowState.RESEARCHED,
          action: "research",
          articlePatch: {
            researchBrief: `${SEARCH_MARK}\n${searchBlob}`,
            errorMessage: null,
          },
          artifact: {
            type: ArtifactType.RESEARCH_BRIEF,
            content: searchBlob,
            metadata: { searchHits: hitCount, uniqueUrls: uniqueUrls.size },
          },
        });
        return withTimings(transitioned, {
          searchMs,
          llmMs: 0,
          searchHits: hitCount,
          searchQueries: queries.length,
          researchPhase: "search",
        });
      }

      // Phase 2: Verification + Synthesis → Research Brief (bước 3–4 OP)
      const memory = await getEditorialMemory(article.domain, article.seriesId);
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

      const evidenceAudit = auditResearchEvidence(researchBrief);
      if (!evidenceAudit.passed) {
        const failed = await commitTransition({
          to: WorkflowState.RESEARCH_REQUIRED,
          action: "research-evidence-validation",
          success: false,
          articlePatch: {
            researchBrief: null,
            errorMessage: `Research Brief chưa đạt evidence contract: ${evidenceAudit.issues.join(" · ")}`.slice(0, 500),
          },
          details: {
            issues: evidenceAudit.issues,
            lineageCount: evidenceAudit.lineages.length,
            urlCount: evidenceAudit.urls.length,
          },
          artifact: {
            type: ArtifactType.RESEARCH_BRIEF,
            content: researchBrief,
            metadata: { evidenceAudit },
          },
        });
        return withTimings(failed, {
          llmMs: Date.now() - llmStarted,
          researchPhase: "evidence-fail",
        });
      }

      const transitioned = await commitTransition({
        to: WorkflowState.SYNTHESIZED,
        action: "synthesis",
        articlePatch: {
          researchBrief,
          errorMessage: null,
        },
        artifact: {
          type: ArtifactType.RESEARCH_BRIEF,
          content: researchBrief,
          domainProfileVersion: `${resolveDomainId(article.domain)}@1.6`,
          metadata: { evidenceAudit },
        },
      });
      return withTimings(transitioned, {
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
            const failed = await commitTransition({
              to: WorkflowState.INSIGHT_REJECTED,
              action: "insight-gate",
              success: false,
              articlePatch: {
                insightGate: withGateRetryMark(retries, insightGate.trim()),
                errorMessage:
                  `Cổng Insight vẫn < L2 sau ${MAX_GATE_RESEARCH_RETRIES} lần nghiên cứu lại. Đổi chủ đề/góc hoặc Làm lại từ đầu.`,
              },
              details: { retry: nextRetry, reason: "Insight < L2" },
              artifact: { type: ArtifactType.REVIEW, content: insightGate },
            });
            return withTimings(failed, {
              llmMs: Date.now() - llmStarted,
              insightPhase: "gate-fail",
            });
          }

          // Quay Research: clear brief, giữ phản hồi Gate để đào góc sắc hơn
          await commitTransition({
            to: WorkflowState.INSIGHT_REJECTED,
            action: "insight-gate",
            success: false,
            articlePatch: {
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
              errorMessage: `Gate < L2 — nghiên cứu lại góc sắc hơn (lần ${nextRetry}/${MAX_GATE_RESEARCH_RETRIES}).`,
            },
            artifact: { type: ArtifactType.REVIEW, content: insightGate },
          });
          const retried = await commitTransition({
            to: WorkflowState.RESEARCH_REQUIRED,
            action: "request-research",
            details: { retry: nextRetry },
          });
          return withTimings(retried, {
            llmMs: Date.now() - llmStarted,
            insightPhase: "gate-retry",
          });
        }

        const transitioned = await commitTransition({
          to: WorkflowState.INSIGHT_APPROVED,
          action: "insight-gate",
          articlePatch: {
            insightGate: withGateRetryMark(
              gateRetryCount(article.insightGate),
              `${insightGate.trim()}\n\n${INSIGHT_GATE_MARK}`,
            ),
            errorMessage: null,
          },
          artifact: { type: ArtifactType.REVIEW, content: insightGate },
        });
        return withTimings(transitioned, {
          llmMs: Date.now() - llmStarted,
          insightPhase: "gate",
        });
      }

      // Decision (bước 5) — context mỏng: timeout thường do Research Brief + reasoning, không do output
      if (phase === "decision") {
        if (!article.articleShapeSnapshot?.trim()) {
          const selectedShape = await selectArticleShape({
            articleId: article.id,
            domain: article.domain,
            publishFormat: article.publishFormat,
            topic: article.topic,
            insightGate: article.insightGate,
          });
          article = await commitPatch({
            action: "select-article-shape",
            articlePatch: {
              articleShapeId: selectedShape.id,
              articleShapeVersion: selectedShape.version,
              articleShapeSnapshot: selectedShape.snapshot,
              openingPattern: selectedShape.openingPattern,
              narrativePattern: selectedShape.narrativePattern,
            },
            details: {
              shapeId: selectedShape.id,
              shapeVersion: selectedShape.version,
            },
          });
        }
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
              shapeBlockFor(article),
            ),
            },
          ],
          { maxTokens: 700, temperature: 0.3, reasoningEffort: "low" },
        );

        const decisionComplete = [
          /Góc chốt/i,
          /Category/i,
          /Audience/i,
          /Lý do chọn/i,
          /Rủi ro editorial/i,
        ].every((rule) => rule.test(decision));
        if (!decisionComplete) {
          const failed = await commitTransition({
            to: WorkflowState.RESEARCH_REQUIRED,
            action: "editorial-decision-validation",
            success: false,
            articlePatch: {
              researchBrief: null,
              insightGate: null,
              errorMessage: "Editorial Decision thiếu trường bắt buộc — quay lại Research/Decision.",
            },
            artifact: { type: ArtifactType.REVIEW, content: decision },
          });
          return withTimings(failed, {
            llmMs: Date.now() - llmStarted,
            insightPhase: "decision-fail",
          });
        }

        const merged = `${gateOnly}\n\n---\n\n${decision.trim()}\n\n${INSIGHT_DECISION_MARK}`;
        const transitioned = await commitTransition({
          to: WorkflowState.DECIDED,
          action: "editorial-decision",
          articlePatch: {
            insightGate: merged,
            errorMessage: null,
          },
          details: { decision },
        });
        return withTimings(transitioned, {
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
              shapeBlockFor(article),
            ),
            },
          ],
          { maxTokens: 1400, temperature: 0.35, reasoningEffort: "low" },
        );

        const planningComplete = [
          /Objective/i,
          /Audience/i,
          /Core Message/i,
          /Story Flow/i,
          /không/i,
        ].every((rule) => rule.test(planning));
        if (!planningComplete) {
          const failed = await commitTransition({
            to: WorkflowState.MAJOR_REVISION_REQUIRED,
            action: "planning-validation",
            success: false,
            articlePatch: {
              errorMessage: "Planning thiếu contract bắt buộc — cần tạo revision kế hoạch/bản nháp.",
            },
            artifact: { type: ArtifactType.REVIEW, content: planning },
          });
          return withTimings(failed, {
            llmMs: Date.now() - llmStarted,
            insightPhase: "planning-fail",
          });
        }

        const merged = `${soFar}\n\n---\n\n${planning.trim()}\n\n${INSIGHT_DONE_MARK}`;
        const transitioned = await commitTransition({
          to: WorkflowState.PLANNED,
          action: "planning",
          articlePatch: {
            insightGate: merged,
            errorMessage: null,
          },
          details: { planning },
        });
        return withTimings(transitioned, {
          llmMs: Date.now() - llmStarted,
          insightPhase: "planning",
        });
      }

      // Đã xong insight → sang Write
      const updated = await commitPatch({
        action: "insight-skip",
        articlePatch: {
          insightGate: article.insightGate?.includes(INSIGHT_DONE_MARK)
            ? article.insightGate
            : `${stripPipelineMarks(article.insightGate)}\n\n${INSIGHT_DONE_MARK}`,
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
              shapeBlockFor(article),
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

        const updated = await commitPatch({
          action: "writing-half",
          articlePatch: {
            draft12: `${cleanA}\n\n${WRITE_HALF_MARK}`,
            errorMessage: null,
          },
          artifact: { type: ArtifactType.ARTICLE_DRAFT, content: cleanA },
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
              shapeBlockFor(article),
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
        assertEngineeringGoldBar({
          domain: article.domain,
          body: merged,
          researchBrief: article.researchBrief,
        });

        const sourceRevision = await latestArtifactRevision(
          articleId,
          ArtifactType.RESEARCH_BRIEF,
        );
        const transitioned = await commitTransition({
          to: WorkflowState.DRAFTED,
          action: "writing",
          articlePatch: {
            draft12: `${merged}\n\n${WRITE_DONE_MARK}`,
            errorMessage: null,
          },
          artifact: {
            type: ArtifactType.ARTICLE_DRAFT,
            content: merged,
            sourceRevision,
            sourceArtifactType: ArtifactType.RESEARCH_BRIEF,
          },
        });
        return withTimings(transitioned, {
          llmMs: Date.now() - llmStarted,
          writePhase: "b",
        });
      }

      // Đã có nháp đủ → sang Finalize (không ghi đè)
      const fullDraft = draft.includes(WRITE_DONE_MARK)
        ? draft
        : `${stripPipelineMarks(draft)}\n\n${WRITE_DONE_MARK}`;
      const updated = await commitTransition({
        to: WorkflowState.DRAFTED,
        action: "writing-skip",
        articlePatch: {
          draft12: fullDraft,
          errorMessage: null,
        },
        artifact: { type: ArtifactType.ARTICLE_DRAFT, content: stripPipelineMarks(fullDraft) },
      });
      return withTimings(updated, { writePhase: "skip" });
    }

    if (step === WorkflowStep.FINALIZE) {
      const finPhase = finalizePhaseOf(article);

      // Bước 8: Review — lưu tạm vào knowledgeRecord + REVIEW_DONE_MARK + chờ người
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
                shapeBlockFor(article),
              ),
            },
          ],
          { maxTokens: 2200, temperature: 0.35, reasoningEffort: "low" },
        );

        const reviewState = /REWRITE_REQUIRED/i.test(reviewOut)
          ? WorkflowState.REWRITE_REQUIRED
          : /MAJOR_REVISION_REQUIRED/i.test(reviewOut)
            ? WorkflowState.MAJOR_REVISION_REQUIRED
            : /MINOR_REVISION_REQUIRED/i.test(reviewOut)
              ? WorkflowState.MINOR_REVISION_REQUIRED
              : WorkflowState.EDITORIAL_REVIEWED;
        const transitioned = await commitTransition({
          to: reviewState,
          action: "editorial-review",
          success: reviewState === WorkflowState.EDITORIAL_REVIEWED,
          articlePatch: {
            knowledgeRecord: withHumanReviewPendingMark(reviewOut.trim()),
            errorMessage: null,
          },
          artifact: {
            type: ArtifactType.REVIEW,
            content: reviewOut,
            sourceRevision: await latestArtifactRevision(articleId, ArtifactType.ARTICLE_DRAFT),
            sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
          },
        });
        return withTimings(transitioned, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: "review",
        });
      }

      // Chờ người xác nhận AI Review (Fail / Minor–Major) trước Fact-check
      if (finPhase === "await-human") {
        const updated = await commitPatch({
          action: "await-human-review",
          articlePatch: { errorMessage: null },
        });
        return withTimings(updated, { finalizePhase: "await-human" });
      }

      if (finPhase === "revision-remediate") {
        const latestHumanConfirmation = await prisma.workflowTransition.findFirst({
          where: {
            articleId,
            workflowRunId: article.workflowRunId,
            action: "human-review-confirmed",
          },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true },
        });
        const remediationAttempts = await prisma.workflowTransition.count({
          where: {
            articleId,
            workflowRunId: article.workflowRunId,
            action: "remediate-required-revision",
            ...(latestHumanConfirmation
              ? { createdAt: { gt: latestHumanConfirmation.createdAt } }
              : {}),
          },
        });
        if (remediationAttempts >= MAX_REVISION_REMEDIATION_RETRIES) {
          const stopped = await commitPatch({
            action: "revision-remediation-exhausted",
            success: false,
            articlePatch: {
              errorMessage:
                `Revision chưa đạt sau ${MAX_REVISION_REMEDIATION_RETRIES} lần remediation — ` +
                "cần editor sửa tay hoặc làm lại workflow.",
            },
            details: { remediationAttempts, revisionState: article.workflowState },
          });
          return withTimings(stopped, {
            finalizePhase: "revision-remediation-exhausted",
          });
        }

        const llmStarted = Date.now();
        const previousDraftRevision = await latestArtifactRevision(
          articleId,
          ArtifactType.ARTICLE_DRAFT,
        );
        const repairedRaw = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-revision-remediate",
                appendContext(
                  `Revision state: ${article.workflowState}`,
                  clipText(article.researchBrief, 4_000),
                  clipText(article.insightGate, 2_000),
                  clipText(stripPipelineMarks(article.draft12), 12_000),
                  clipText(article.knowledgeRecord, 6_000),
                  clipText(article.factCheck, 5_000),
                  `Chủ đề: ${topic}`,
                ),
                undefined,
                shapeBlockFor(article),
              ),
            },
          ],
          { maxTokens: 5600, temperature: 0.25, reasoningEffort: "low" },
        );
        const repairedDraft = sanitizeEditorialBody(stripPipelineMarks(repairedRaw));
        assertFullDraftQuality(repairedDraft);
        assertEngineeringGoldBar({
          domain: article.domain,
          body: repairedDraft,
          researchBrief: article.researchBrief,
        });
        const retainedReview = (article.knowledgeRecord ?? "")
          .replace(/\n+##\s*Final Verification \(pipeline\)[\s\S]*$/i, "")
          .replace(/\n+##\s*Reader Simulation[\s\S]*$/i, "")
          .replaceAll(FINAL_REVIEW_DONE_MARK, "")
          .replaceAll(READER_SIM_DONE_MARK, "")
          .trim();
        const transitioned = await commitTransition({
          // Review người đã chốt; revision xong đi thẳng Fact Check, không mở lại bước 8.
          to: WorkflowState.EDITORIAL_REVIEWED,
          action: "remediate-required-revision",
          articlePatch: {
            draft12: `${repairedDraft}\n\n${WRITE_DONE_MARK}`,
            factCheck: null,
            knowledgeRecord: retainedReview,
            cleanPublish: null,
            heroBrief: null,
            errorMessage: null,
          },
          details: {
            revisionSeverity: article.workflowState,
            invalidatedFactCheck: Boolean(article.factCheck?.trim()),
            invalidatedFinalReview: Boolean(article.knowledgeRecord?.includes(FINAL_REVIEW_DONE_MARK)),
            previousDraftRevision,
          },
          artifact: {
            type: ArtifactType.ARTICLE_DRAFT,
            content: repairedDraft,
            sourceRevision: previousDraftRevision,
            sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
          },
        });
        return withTimings(transitioned, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: "revision-remediate",
        });
      }

      // FACT_CHECK_FAILED: sửa exact Article revision trước khi kiểm tra lại.
      if (finPhase === "fact-remediate") {
        const remediationAttempts = await prisma.workflowTransition.count({
          where: {
            articleId,
            workflowRunId: article.workflowRunId,
            action: "remediate-fact-check",
          },
        });
        if (remediationAttempts >= MAX_FACT_REMEDIATION_RETRIES) {
          const stopped = await commitPatch({
            action: "fact-remediation-exhausted",
            success: false,
            articlePatch: {
              errorMessage:
                `Fact Check chưa đạt sau ${MAX_FACT_REMEDIATION_RETRIES} lần remediation — ` +
                "cần editor sửa claim/nguồn hoặc làm lại workflow.",
            },
            details: {
              remediationAttempts,
              verificationStatus: verificationStatus(article.factCheck),
            },
          });
          return withTimings(stopped, {
            finalizePhase: "fact-remediation-exhausted",
          });
        }

        const llmStarted = Date.now();
        const previousDraftRevision = await latestArtifactRevision(
          articleId,
          ArtifactType.ARTICLE_DRAFT,
        );
        const repairedRaw = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-fact-remediate",
                appendContext(
                  clipText(article.researchBrief, 3_500),
                  clipText(stripPipelineMarks(article.draft12), 12_000),
                  clipText(article.factCheck, 6_000),
                  `Chủ đề: ${topic}`,
                ),
              ),
            },
          ],
          { maxTokens: 5200, temperature: 0.2, reasoningEffort: "low" },
        );
        const repairedDraft = sanitizeEditorialBody(stripPipelineMarks(repairedRaw));
        assertFullDraftQuality(repairedDraft);
        assertEngineeringGoldBar({
          domain: article.domain,
          body: repairedDraft,
          researchBrief: article.researchBrief,
        });
        const transitioned = await commitTransition({
          to: WorkflowState.EDITORIAL_REVIEWED,
          action: "remediate-fact-check",
          articlePatch: {
            draft12: `${repairedDraft}\n\n${WRITE_DONE_MARK}`,
            factCheck: null,
            errorMessage: null,
          },
          details: {
            failedVerificationStatus: verificationStatus(article.factCheck),
            invalidatedFactCheck: true,
            previousDraftRevision,
          },
          artifact: {
            type: ArtifactType.ARTICLE_DRAFT,
            content: repairedDraft,
            sourceRevision: previousDraftRevision,
            sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
          },
        });
        return withTimings(transitioned, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: "fact-remediate",
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
        const factCheckContent = parsed.factCheck ?? finalizeA;
        const passed = /^PASSED$/i.test(verificationStatus(factCheckContent));
        const transitioned = await commitTransition({
          to: passed ? WorkflowState.FACT_CHECKED : WorkflowState.FACT_CHECK_FAILED,
          action: "fact-check",
          success: passed,
          articlePatch: {
            factCheck: factCheckContent,
            errorMessage: passed
              ? null
              : "Fact Check chưa PASSED — cần sửa claim hoặc chạy lại Fact Check.",
          },
          details: { verificationStatus: verificationStatus(factCheckContent) },
          artifact: {
            type: ArtifactType.FACT_CHECK,
            content: factCheckContent,
            sourceRevision: await latestArtifactRevision(articleId, ArtifactType.ARTICLE_DRAFT),
            sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
          },
        });
        return withTimings(transitioned, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: passed ? "fact" : "fact-fail",
        });
      }

      // Bước 9b: khóa Evidence và quyết định cuối trước khi được tạo publish package.
      if (finPhase === "final-verify") {
        // Chặn trước: draft Engineering chưa đạt GOLD_BAR → đừng gọi LLM 9b (tránh fail điểm rồi đốt Fact-check).
        try {
          assertEngineeringGoldBar({
            domain: article.domain,
            body: stripPipelineMarks(article.draft12),
            researchBrief: article.researchBrief,
          });
        } catch (preBar) {
          const msg = preBar instanceof Error ? preBar.message : String(preBar);
          const transitioned = await commitTransition({
            to: WorkflowState.MINOR_REVISION_REQUIRED,
            action: "pre-final-verification-gold-bar",
            success: false,
            articlePatch: {
              errorMessage:
                `Pre-9b: ${msg} — sửa draft trước Khóa Review (tránh vòng Fact-check oan).`,
            },
            details: { phase: "pre-final-verify", goldBar: true },
          });
          return withTimings(transitioned, {
            finalizePhase: "final-verify-precheck-fail",
          });
        }

        const llmStarted = Date.now();
        const rescoreHint =
          article.errorMessage &&
          /Final Verification output chưa đúng machine format|điểm thoái hoá|không khớp band điểm/i.test(
            article.errorMessage,
          )
            ? [
                "## LẦN CHẤM LẠI (bắt buộc — lần trước sai format / điểm thoái hoá)",
                "CẤM xuất FINAL_TOTAL_SCORE: 0 và FINAL_INSIGHT_SCORE: 0.",
                "Chấm lại theo rubric trên bản nháp + Fact-Check Ledger trong CONTEXT.",
                "Mỗi trường máy một dòng riêng. FINAL_DECISION phải khớp band điểm",
                `(FINAL_REVIEWED ≥${TFES_CONTRACT.finalReview.minimumTotalScore}; MINOR 85–89; MAJOR 75–84; REWRITE <75 hoặc insight <22).`,
                "Không dùng chữ PUBLISH_READY trong FINAL_DECISION.",
                "Khi Fact Check PASSED, G1–G8 đạt, 0 open action, insight ≥22: ưu tiên FINAL_REVIEWED tổng ≥90 — không đậu ở 87–89 vì lỗi chữ nhỏ.",
              ].join("\n")
            : "";
        const finalReview = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: buildPipelinePrompt(
                "finalize-verify",
                appendContext(
                  clipText(extractEditorialReview(article.knowledgeRecord), 3_000),
                  clipText(article.factCheck, 4_000),
                  clipText(stripPipelineMarks(article.draft12), 7_000),
                  `Chủ đề: ${topic}`,
                  rescoreHint,
                ),
              ),
            },
          ],
          { maxTokens: 2200, temperature: 0.2, reasoningEffort: "low" },
        );
        const result = inspectFinalVerification(finalReview, article.factCheck);
        if (!result.machineReadable) {
          const formatAttempts = await prisma.workflowTransition.count({
            where: {
              articleId,
              workflowRunId: article.workflowRunId,
              action: "final-verification-format-invalid",
            },
          });
          const nextAttempt = formatAttempts + 1;
          const exhausted = nextAttempt >= MAX_FINAL_VERIFICATION_FORMAT_RETRIES;
          const reasonHint = result.degenerateScores
            ? "điểm thoái hoá 0/0"
            : result.failureReasons[0] || "sai format";
          const updated = await commitPatch({
            action: "final-verification-format-invalid",
            success: false,
            articlePatch: {
              errorMessage: exhausted
                ? `Final Verification sai định dạng sau ${MAX_FINAL_VERIFICATION_FORMAT_RETRIES} lần — ` +
                  result.failureReasons.join(" · ")
                : `Final Verification output chưa đúng machine format ` +
                  `(${reasonHint}; lần ${nextAttempt}/${MAX_FINAL_VERIFICATION_FORMAT_RETRIES}) — tự chạy lại 9b.`,
            },
            details: { ...result, formatAttempt: nextAttempt },
            artifact: {
              type: ArtifactType.REVIEW,
              content: finalReview,
              sourceRevision: await latestArtifactRevision(articleId, ArtifactType.FACT_CHECK),
              sourceArtifactType: ArtifactType.FACT_CHECK,
            },
          });
          return withTimings(updated, {
            llmMs: Date.now() - llmStarted,
            finalizePhase: exhausted
              ? "final-verify-format-exhausted"
              : "final-verify-format-retry",
          });
        }
        const nextState = result.publishReady
          ? WorkflowState.FINAL_REVIEWED
          : (result.totalScore ?? 0) < 75 ||
              (result.insightScore ?? 0) < TFES_CONTRACT.finalReview.minimumInsightScore
            ? WorkflowState.REWRITE_REQUIRED
            : (result.totalScore ?? 0) < 85
              ? WorkflowState.MAJOR_REVISION_REQUIRED
              : WorkflowState.MINOR_REVISION_REQUIRED;
        const nextKr = `${article.knowledgeRecord ?? ""}\n\n## Final Verification (pipeline)\n${finalReview}${result.publishReady ? `\n\n${FINAL_REVIEW_DONE_MARK}` : ""}`.trim();
        const transitioned = await commitTransition({
          to: nextState,
          action: "final-verification",
          success: result.publishReady,
          articlePatch: {
            knowledgeRecord: nextKr,
            errorMessage: result.publishReady
              ? null
              : `Final Verification chưa đạt — ${result.failureReasons.join(" · ")}.`,
          },
          details: { ...result },
          artifact: {
            type: ArtifactType.REVIEW,
            content: finalReview,
            sourceRevision: await latestArtifactRevision(articleId, ArtifactType.FACT_CHECK),
            sourceArtifactType: ArtifactType.FACT_CHECK,
          },
        });
        return withTimings(transitioned, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: result.publishReady ? "final-verify" : "final-verify-fail",
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
              shapeBlockFor(article),
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
          publishFormat: article.publishFormat,
          clean: polished,
          prefs,
          topic,
          domain: article.domain,
          researchBrief: article.researchBrief,
        });
        try {
          polished = await ensureCleanPublishQuality({
          articleId,
          publishFormat: article.publishFormat,
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
          await commitPatch({
            action: "polish-quality-failed",
            articlePatch: {
              cleanPublish: polished.length >= 80 ? polished : article.cleanPublish,
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
          const updated = await commitPatch({
            action: "polish-self-check-failed",
            articlePatch: {
              cleanPublish: polished,
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
                  extractArticleVisualContext({
                    cleanPublish: polished,
                    title,
                    topic,
                  }),
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

        const transitioned = await commitTransition({
          to: WorkflowState.POLISHED,
          action: "polish",
          articlePatch: {
            cleanPublish: `${polished}\n\n${CLEAN_POLISH_MARK}`,
            title,
            heroBrief,
            errorMessage: null,
          },
          artifact: {
            type: ArtifactType.PUBLISH_PACKAGE,
            content: polished,
            sourceRevision: await latestArtifactRevision(articleId, ArtifactType.REVIEW),
            sourceArtifactType: ArtifactType.REVIEW,
          },
        });
        return withTimings(transitioned, {
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
              shapeBlockFor(article),
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
          const transitioned = await commitTransition({
            to: WorkflowState.READER_SIMULATION_FAILED,
            action: "reader-simulation",
            success: false,
            articlePatch: {
              cleanPublish: cleanWithoutPolish,
              knowledgeRecord: krNext,
              errorMessage: `Reader Sim chưa đạt: ${feedback}`.slice(0, 500),
            },
            artifact: { type: ArtifactType.READER_SIMULATION, content: simOut },
          });
          return withTimings(transitioned, {
            llmMs: Date.now() - llmStarted,
            finalizePhase: "reader-sim-fail",
          });
        }

        const krBase = stripReaderSimSection(article.knowledgeRecord ?? "");
        const krFinal = `${krBase}\n\n## Reader Simulation\n${simOut}\n\n${READER_SIM_DONE_MARK}`.trim();
        const readerPatch = {
            knowledgeRecord: krFinal,
            cleanPublish: article.cleanPublish?.includes(CLEAN_POLISH_MARK)
              ? article.cleanPublish
              : `${cleanBody}\n\n${CLEAN_POLISH_MARK}`,
            errorMessage: failed
              ? `Reader Simulation chưa đạt sau ${MAX_READER_SIM_RETRIES + 1} lần: ${simOut.slice(0, 350)}`
              : null,
          };
        if (failed) {
          const failedArticle = await commitTransition({
            to: WorkflowState.READER_SIMULATION_FAILED,
            action: "reader-simulation",
            success: false,
            articlePatch: readerPatch,
            artifact: { type: ArtifactType.READER_SIMULATION, content: simOut },
          });
          return withTimings(failedArticle, {
            llmMs: Date.now() - llmStarted,
            finalizePhase: "reader-sim-fail",
          });
        }
        assertFinalVerificationPassed(article.knowledgeRecord, article.factCheck);
        await commitTransition({
          to: WorkflowState.READER_SIMULATED,
          action: "reader-simulation",
          articlePatch: readerPatch,
          artifact: { type: ArtifactType.READER_SIMULATION, content: simOut },
        });
        const transitioned = await commitTransition({
          to: WorkflowState.PUBLISH_READY,
          action: "package",
          artifact: {
            type: ArtifactType.PUBLISH_PACKAGE,
            content: `${krFinal}\n\n${cleanBody}`,
            sourceRevision: await latestArtifactRevision(articleId, ArtifactType.REVIEW),
            sourceArtifactType: ArtifactType.REVIEW,
          },
        });
        return withTimings(transitioned, {
          llmMs: Date.now() - llmStarted,
          finalizePhase: "reader-sim",
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
            assertEngineeringGoldBar({
              domain: article.domain,
              body: cleanedExisting,
              researchBrief: article.researchBrief,
            });
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
                const updated = await commitPatch({
                  action: "await-reader-simulation",
                  articlePatch: {
                    cleanPublish: marked,
                    errorMessage: null,
                  },
                });
                return withTimings(updated, { finalizePhase: "await-reader-sim" });
              }
              const updated = await commitTransition({
                to: WorkflowState.PUBLISH_READY,
                action: "package-skip",
                articlePatch: {
                  cleanPublish: marked,
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
              shapeBlockFor(article),
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
          publishFormat: article.publishFormat,
          clean: cleanPublish,
          prefs,
          topic,
          domain: article.domain,
          researchBrief: article.researchBrief,
        });
        try {
          cleanPublish = await ensureCleanPublishQuality({
          articleId,
          publishFormat: article.publishFormat,
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
          await commitPatch({
            action: "publish-quality-failed",
            articlePatch: {
              cleanPublish: cleanPublish.length >= 80 ? cleanPublish : article.cleanPublish,
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
        let knowledgeRecord = mergeKnowledgeWithPriorReview(
          parsed.knowledgeRecord ??
            (priorReview
              ? null
              : article.knowledgeRecord?.includes(REVIEW_DONE_MARK)
                ? null
                : article.knowledgeRecord),
          priorReview,
        );
        if (
          (article.knowledgeRecord ?? "").includes(FINAL_REVIEW_DONE_MARK) &&
          !knowledgeRecord.includes(FINAL_REVIEW_DONE_MARK)
        ) {
          const finalBlock = (article.knowledgeRecord ?? "").match(
            /##\s*Final Verification \(pipeline\)[\s\S]*?(?=\n##\s*Reader Simulation|$)/i,
          )?.[0]?.trim();
          if (finalBlock) {
            knowledgeRecord = `${knowledgeRecord}\n\n${finalBlock}\n\n${FINAL_REVIEW_DONE_MARK}`.trim();
          }
        }

        if (selfCheck.length > 0) {
          const detail = selfCheck.map((i) => i.message).join(" · ");
          const updated = await commitPatch({
            action: "publish-self-check-failed",
            articlePatch: {
              cleanPublish,
              heroBrief: parsed.heroBrief,
              knowledgeRecord: knowledgeRecord || article.knowledgeRecord,
              title: stripInsightLevelLabels(
                cleanPublish.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? article.topic ?? "Untitled",
              ),
              draft12: article.draft12?.includes(WRITE_DONE_MARK)
                ? article.draft12
                : `${sanitizeEditorialBody(draftClean)}\n\n${WRITE_DONE_MARK}`,
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
        const nextPublishRevision =
          ((await latestArtifactRevision(articleId, ArtifactType.PUBLISH_PACKAGE)) ?? 0) + 1;

        // Giữ DRAFT để tick tiếp chạy polish (10b) — tránh timeout gộp 2 LLM
        const updated = await commitPatch({
          action: "build-publish-package",
          articlePatch: {
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
            errorMessage: null,
          },
          artifacts: [
            {
              type: ArtifactType.PUBLISH_PACKAGE,
              content: `${knowledgeRecord}\n\n${cleanPublish}`,
              sourceRevision: await latestArtifactRevision(articleId, ArtifactType.REVIEW),
              sourceArtifactType: ArtifactType.REVIEW,
            },
            {
              type: ArtifactType.KNOWLEDGE_RECORD,
              content: knowledgeRecord || "",
              sourceRevision: nextPublishRevision,
              sourceArtifactType: ArtifactType.PUBLISH_PACKAGE,
            },
          ],
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

    if (
      isWritePhaseQualityFail(raw) &&
      new Set<WorkflowState>([
        WorkflowState.PLANNED,
        WorkflowState.DRAFTED,
        WorkflowState.MINOR_REVISION_REQUIRED,
        WorkflowState.MAJOR_REVISION_REQUIRED,
        WorkflowState.REWRITE_REQUIRED,
      ]).has(cursor.state)
    ) {
      try {
        const rewritten = await commitTransition({
          to: WorkflowState.REWRITE_REQUIRED,
          action: "writing-quality-validation",
          success: false,
          articlePatch: { errorMessage: raw.slice(0, 500) },
          details: { isQuality: true },
        });
        return withTimings(rewritten, { writePhase: "rewrite-required" });
      } catch (transitionError) {
        if (!/Workflow conflict/i.test(String(transitionError))) throw transitionError;
      }
    }

    try {
      await commitPatch({
        action: "workflow-step-error",
        success: false,
        articlePatch: {
        errorMessage: redactSecrets(raw).slice(0, 500),
        ...(isListicleRewrite
          ? {
              draft12: null,
            }
          : {}),
        },
        details: { isTimeout, isQuality, isCleanPublishFail },
      });
    } catch (patchError) {
      if (!/Workflow conflict/i.test(String(patchError))) throw patchError;
    }
    throw error instanceof Error ? error : new Error(raw);
  }
}

export async function resetWorkflow(articleId: string): Promise<Article> {
  return resetWorkflowArticle({
    articleId,
    articlePatch: {
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
      galleryJson: null,
      deskJson: null,
      articleShapeId: null,
      articleShapeVersion: null,
      articleShapeSnapshot: null,
      openingPattern: null,
      narrativePattern: null,
    },
  });
}

/**
 * Người xác nhận Fail / Minor từ AI Review — mở khóa Fact-check.
 */
export async function confirmHumanReview(
  articleId: string,
  payload: HumanReviewPayload,
): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });

  if (!isAwaitingHumanReview(article)) {
    throw new Error("Bài này không đang chờ xác nhận Review người");
  }

  const findings = parseEditorialFindings(article.knowledgeRecord);
  if (findings.length > 0) {
    const byId = new Map(payload.items.map((i) => [i.id, i]));
    const missing = findings.filter((f) => {
      const item = byId.get(f.id);
      return !item || (item.disposition !== "fixed" && item.disposition !== "accept");
    });
    if (missing.length > 0) {
      throw new Error(
        `Còn ${missing.length} điểm Review chưa xác nhận (Đã sửa / Chấp nhận rủi ro)`,
      );
    }
  }

  const notes = payload.notes?.trim() ?? "";
  const nextKr = applyHumanReviewToKnowledge(
    article.knowledgeRecord,
    { items: payload.items, notes },
    findings,
  );

  const aiRequestedRevision = new Set<WorkflowState>([
    WorkflowState.MINOR_REVISION_REQUIRED,
    WorkflowState.MAJOR_REVISION_REQUIRED,
    WorkflowState.REWRITE_REQUIRED,
  ]).has(article.workflowState);
  const requestedAiFix = payload.items.some(
    (item) => item.id !== "ack-pass" && item.disposition === "fixed",
  );
  const requiresRevision = aiRequestedRevision && requestedAiFix;

  return transitionArticle({
    articleId,
    expectedState: article.workflowState,
    expectedVersion: article.workflowVersion,
    to: requiresRevision ? article.workflowState : WorkflowState.EDITORIAL_REVIEWED,
    action: "human-review-confirmed",
    articlePatch: {
      knowledgeRecord: nextKr,
      errorMessage: requiresRevision
        ? "Review đã được người xác nhận — hệ thống sẽ tạo draft revision mới."
        : null,
      reviewerNotes: notes
        ? [article.reviewerNotes?.trim(), `Review giữa chu trình:\n${notes}`]
            .filter(Boolean)
            .join("\n\n")
        : article.reviewerNotes,
    },
    details: {
      findings: findings.length,
      requestedAiFix,
      acceptedWithoutRevision: aiRequestedRevision && !requestedAiFix,
    },
  });
}

export async function approveArticle(
  articleId: string,
  approverId: string,
  notes?: string,
  opts?: {
    allowWithoutHero?: boolean;
    editorialScore?: number;
    checklist?: string[];
    reviewFindingsAck?: string[];
    goldBarOverride?: boolean;
  },
): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });

  if (
    article.workflowState !== WorkflowState.PUBLISH_READY
  ) {
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

  if (score <= 2 && !(notes?.trim() && notes.trim().length >= 8)) {
    throw new Error("Điểm ≤2 cần ghi chú reviewer (vì sao / cần sửa gì)");
  }

  const findings = parseEditorialFindings(article.knowledgeRecord);
  if (findings.length > 0) {
    const ack = new Set(opts?.reviewFindingsAck ?? []);
    const missing = findings.filter((f) => !ack.has(f.id));
    if (missing.length > 0) {
      throw new Error(
        `Tick đủ ${findings.length} điểm Review AI trên cổng duyệt (còn thiếu ${missing.length})`,
      );
    }
  }

  // Fact-check tương tác: claim AI xấu phải được người chốt
  const { parseFactClaims, unresolvedBadClaims } = await import("@/lib/tfes/fact-ledger");
  const { parseDeskJson } = await import("@/lib/tfes/desk-state");
  const factClaims = parseFactClaims(article.factCheck);
  const desk = parseDeskJson(article.deskJson);
  const unresolved = unresolvedBadClaims(factClaims, desk.factClaims);
  if (unresolved.length > 0) {
    throw new Error(
      `Còn ${unresolved.length} claim Fact-check (Unsupported/Contradicted…) chưa chốt ở tab Fact-check`,
    );
  }
  assertFinalVerificationPassed(article.knowledgeRecord, article.factCheck);

  const goldBar = inspectEngineeringGoldBar({
    domain: article.domain,
    body: article.cleanPublish,
    researchBrief: article.researchBrief,
  });
  if (goldBar.applicable && !goldBar.ok) {
    if (!opts?.goldBarOverride) {
      throw new Error(
        `Chuẩn vàng Engineering chưa đạt (${goldBar.failures.map((f) => f.id).join(", ")}). ` +
          `Sửa bản sạch hoặc tick Override kèm ghi chú ≥20 ký tự. ` +
          goldBar.failures.map((f) => f.message).join(" · "),
      );
    }
    if (!(notes?.trim() && notes.trim().length >= 20)) {
      throw new Error(
        "Override chuẩn vàng Engineering cần ghi chú ≥20 ký tự (vì sao vẫn duyệt).",
      );
    }
  }

  const scoreNote = `Điểm biên tập: ${score}/5`;
  const reviewAckNote =
    findings.length > 0
      ? `Review AI ack: ${findings.map((f) => f.id).join(", ")}`
      : "";
  const goldOverrideNote =
    goldBar.applicable && !goldBar.ok && opts?.goldBarOverride
      ? `GOLD_BAR override: ${goldBar.failures.map((f) => f.id).join(", ")}`
      : "";
  const mergedNotes = [notes?.trim(), scoreNote, reviewAckNote, goldOverrideNote]
    .filter(Boolean)
    .join("\n");

  const approvedAt = new Date();
  const updated = await transitionArticle({
    articleId,
    expectedState: article.workflowState,
    expectedVersion: article.workflowVersion,
    to: WorkflowState.APPROVED,
    action: "human-approval",
    actorId: approverId,
    articlePatch: {
      approvedById: approverId,
      reviewerNotes: mergedNotes || null,
      approvedAt,
    },
    details: {
      editorialScore: score,
      approvedAt: approvedAt.toISOString(),
      goldBarOverride: Boolean(opts?.goldBarOverride && goldBar.applicable && !goldBar.ok),
      goldBarFailures: goldBar.failures.map((f) => f.id),
    },
  });

  if (article.title) {
    const freshnessDays =
      TFES_CONTRACT.freshnessReviewDays[resolveDomainId(article.domain)];
    const nextFreshnessReviewAt = new Date(
      approvedAt.getTime() + freshnessDays * 24 * 60 * 60 * 1000,
    );
    await prisma.knowledgeRecord.upsert({
      where: { articleId },
      create: {
        articleId,
        title: article.title,
        domain: article.domain,
        coreMessage: article.knowledgeRecord ?? undefined,
        editorialScore: score ?? undefined,
        currentVersion: article.contentVersion,
        retractionStatus: "none",
        lastVerifiedAt: approvedAt,
        nextFreshnessReviewAt,
      },
      update: {
        title: article.title,
        coreMessage: article.knowledgeRecord ?? undefined,
        ...(score != null ? { editorialScore: score } : {}),
        currentVersion: article.contentVersion,
        retractionStatus: "none",
        lastVerifiedAt: approvedAt,
        nextFreshnessReviewAt,
      },
    });
  }

  return updated;
}

export async function publishArticle(articleId: string): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });

  if (
    article.workflowState !== WorkflowState.APPROVED
  ) {
    throw new Error("Bài cần được duyệt trước khi publish");
  }

  const publishedAt = new Date();
  const updated = await transitionArticle({
    articleId,
    expectedState: article.workflowState,
    expectedVersion: article.workflowVersion,
    to: WorkflowState.PUBLISHED,
    action: "publish",
    articlePatch: {
      publishedAt,
    },
    details: { publishedAt: publishedAt.toISOString() },
  });

  // Nuôi gold_samples khi điểm ≥ 4
  try {
    const kr = await prisma.knowledgeRecord.findUnique({ where: { articleId } });
    const score = kr?.editorialScore;
    if (
      typeof score === "number" &&
      score >= 4 &&
      (article.cleanPublish ?? "").trim().length >= 80
    ) {
      const { appendGoldSampleFromArticle } = await import("@/lib/tfes/editorial-memory");
      await appendGoldSampleFromArticle({
        domain: article.domain,
        title: article.title || article.topic || "Untitled",
        cleanPublish: article.cleanPublish!,
        score,
        updatedBy: "publish-gold",
      });
    }
  } catch {
    /* không chặn publish nếu gold fail */
  }

  return updated;
}

export async function requestCorrection(
  articleId: string,
  report: string,
  actorId: string,
): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  if (article.workflowState !== WorkflowState.PUBLISHED) {
    throw new Error("Chỉ mở correction audit cho bài đã PUBLISHED");
  }
  if (report.trim().length < 8) throw new Error("Correction report quá ngắn");
  return transitionArticle({
    articleId,
    expectedState: article.workflowState,
    expectedVersion: article.workflowVersion,
    to: WorkflowState.CORRECTION_REQUIRED,
    action: "correction-audit",
    actorId,
    success: false,
    artifact: { type: ArtifactType.CORRECTION, content: report.trim() },
  });
}

export async function applyCorrection(
  articleId: string,
  correction: string,
  meaningChanged: boolean,
  actorId: string,
): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  if (article.workflowState !== WorkflowState.CORRECTION_REQUIRED) {
    throw new Error("Bài không ở trạng thái CORRECTION_REQUIRED");
  }
  const correctedBody = stripPipelineMarks(correction);
  if (correctedBody.length < 80) {
    throw new Error("Cần gửi toàn bộ bản Markdown đã correction (tối thiểu 80 ký tự)");
  }

  const nextContentVersion = bumpContentVersion(
    article.contentVersion,
    meaningChanged ? "major" : "patch",
  );
  const existingKnowledge = await prisma.knowledgeRecord.findUnique({ where: { articleId } });
  const historyEntry = JSON.stringify({
    fromVersion: article.contentVersion,
    toVersion: nextContentVersion,
    meaningChanged,
    correctedAt: new Date().toISOString(),
    actorId,
  });
  const correctionHistory = [existingKnowledge?.correctionHistory?.trim(), historyEntry]
    .filter(Boolean)
    .join("\n");

  const corrected = await transitionArticle({
    articleId,
    expectedState: article.workflowState,
    expectedVersion: article.workflowVersion,
    to: WorkflowState.CORRECTED,
    action: "apply-correction",
    actorId,
    articlePatch: {
      contentVersion: nextContentVersion,
      cleanPublish: correctedBody,
      title:
        stripInsightLevelLabels(correctedBody.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "") ||
        article.title,
    },
    knowledgeRecordPatch: {
      currentVersion: nextContentVersion,
      retractionStatus: "corrected",
      correctionHistory,
      lastVerifiedAt: meaningChanged ? null : new Date(),
    },
    artifact: { type: ArtifactType.CORRECTION, content: correction.trim() },
    details: { meaningChanged },
  });
  if (!meaningChanged) {
    return transitionArticle({
      articleId,
      expectedState: corrected.workflowState,
      expectedVersion: corrected.workflowVersion,
      to: WorkflowState.PUBLISHED,
      action: "republish-non-semantic-correction",
      actorId,
      knowledgeRecordPatch: {
        currentVersion: nextContentVersion,
        retractionStatus: "corrected",
        correctionHistory,
      },
    });
  }

  const nextKr = (corrected.knowledgeRecord ?? "")
    .replace(/\n*##\s*Final Verification \(pipeline\)[\s\S]*?(?=\n##\s*Reader Simulation|$)/i, "")
    .replace(/\n*##\s*Reader Simulation[\s\S]*$/i, "")
    .replaceAll(FINAL_REVIEW_DONE_MARK, "")
    .replaceAll(READER_SIM_DONE_MARK, "")
    .trim();
  return transitionArticle({
    articleId,
    expectedState: corrected.workflowState,
    expectedVersion: corrected.workflowVersion,
    to: WorkflowState.CORRECTED,
    action: "corrected-article-revision",
    actorId,
    articlePatch: {
      draft12: `${correctedBody}\n\n${WRITE_DONE_MARK}`,
      factCheck: null,
      knowledgeRecord: `${nextKr}\n\n## Correction applied\n${correction.trim()}`.trim(),
      errorMessage: "Correction đổi meaning — bắt buộc chạy lại Fact Check và Final Verification.",
      approvedAt: null,
      approvedById: null,
      publishedAt: null,
    },
    knowledgeRecordPatch: {
      currentVersion: nextContentVersion,
      retractionStatus: "corrected",
      correctionHistory,
      lastVerifiedAt: null,
    },
    artifact: {
      type: ArtifactType.ARTICLE_DRAFT,
      content: correctedBody,
      sourceRevision: await latestArtifactRevision(articleId, ArtifactType.CORRECTION),
      sourceArtifactType: ArtifactType.CORRECTION,
    },
  });
}

export async function retractArticle(
  articleId: string,
  reason: string,
  actorId: string,
): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  if (
    article.workflowState !== WorkflowState.PUBLISHED &&
    article.workflowState !== WorkflowState.CORRECTION_REQUIRED
  ) {
    throw new Error("Chỉ retract bài đã publish hoặc đang correction audit");
  }
  if (reason.trim().length < 8) throw new Error("Lý do retract quá ngắn");
  const existingKnowledge = await prisma.knowledgeRecord.findUnique({ where: { articleId } });
  const retractionEntry = JSON.stringify({
    version: article.contentVersion,
    retractedAt: new Date().toISOString(),
    actorId,
    reason: reason.trim(),
  });
  return transitionArticle({
    articleId,
    expectedState: article.workflowState,
    expectedVersion: article.workflowVersion,
    to: WorkflowState.RETRACTED,
    action: "retract",
    actorId,
    knowledgeRecordPatch: {
      retractionStatus: "retracted",
      correctionHistory: [existingKnowledge?.correctionHistory?.trim(), retractionEntry]
        .filter(Boolean)
        .join("\n"),
    },
    artifact: { type: ArtifactType.CORRECTION, content: reason.trim() },
  });
}

/**
 * Lưu bản sạch do người sửa tay (Human Edit Loop).
 */
export async function saveCleanPublishEdit(
  articleId: string,
  cleanMarkdown: string,
  editNote?: string,
): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  if (
    article.workflowState === WorkflowState.PUBLISHED ||
    article.workflowState === WorkflowState.RETRACTED ||
    article.workflowState === WorkflowState.CORRECTION_REQUIRED
  ) {
    throw new Error("Bài đã publish — không sửa bản sạch");
  }
  if (article.workflowState === WorkflowState.APPROVED) {
    throw new Error("Bài đã được duyệt — cần thu hồi phê duyệt trước khi sửa");
  }
  const body = cleanMarkdown.trim();
  if (body.length < 80) {
    throw new Error("Bản sạch quá ngắn");
  }

  const { mergeDeskJson } = await import("@/lib/tfes/desk-state");
  const keepPolish = (article.cleanPublish ?? "").includes(CLEAN_POLISH_MARK);
  let next = stripPipelineMarks(body);
  if (keepPolish) next = `${next}\n\n${CLEAN_POLISH_MARK}`;
  next = `${next}\n\n${HUMAN_EDIT_MARK}`.trim();

  const title =
    stripInsightLevelLabels(next.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? "") ||
    article.title;

  const invalidatingStates = new Set<WorkflowState>([
    WorkflowState.FINAL_REVIEWED,
    WorkflowState.POLISHED,
    WorkflowState.READER_SIMULATED,
    WorkflowState.PUBLISH_READY,
  ]);
  const invalidatesFinalReview = invalidatingStates.has(article.workflowState);
  const knowledgeRecord = invalidatesFinalReview
    ? (article.knowledgeRecord ?? "")
        .replace(/\n*##\s*Final Verification \(pipeline\)[\s\S]*?(?=\n##\s*Reader Simulation|$)/i, "")
        .replace(/\n*##\s*Reader Simulation[\s\S]*$/i, "")
        .replaceAll(FINAL_REVIEW_DONE_MARK, "")
        .replaceAll(READER_SIM_DONE_MARK, "")
        .trim()
    : article.knowledgeRecord;
  const articlePatch = {
      cleanPublish: next,
      title: title || article.title,
      deskJson: mergeDeskJson(article.deskJson, {
        editNote: editNote?.trim() || undefined,
        editedAt: new Date().toISOString(),
      }),
      knowledgeRecord,
      errorMessage: null,
    };
  if (invalidatesFinalReview) {
    return transitionArticle({
      articleId,
      to: WorkflowState.MINOR_REVISION_REQUIRED,
      action: "human-edit-invalidated-final-review",
      success: false,
      articlePatch,
      details: { editNote: editNote?.trim() || null },
      artifact: { type: ArtifactType.PUBLISH_PACKAGE, content: next },
    });
  }
  return patchWorkflowArticle({
    articleId,
    expectedState: article.workflowState,
    expectedVersion: article.workflowVersion,
    action: "human-edit",
    articlePatch,
    artifact: { type: ArtifactType.PUBLISH_PACKAGE, content: next },
  });
}

/**
 * Polish nhẹ tôn trọng chỉnh sửa tay của người.
 */
export async function polishFromHumanEdits(
  articleId: string,
  editNote?: string,
): Promise<Article> {
  await hydrateTfesOverrides();
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  if (
    article.workflowState === WorkflowState.PUBLISHED ||
    article.workflowState === WorkflowState.RETRACTED ||
    article.workflowState === WorkflowState.CORRECTION_REQUIRED
  ) {
    throw new Error("Bài đã publish");
  }
  if (article.workflowState === WorkflowState.APPROVED) {
    throw new Error("Bài đã được duyệt — không polish lại trước khi thu hồi phê duyệt");
  }
  const rawClean = stripPipelineMarks(article.cleanPublish);
  if (rawClean.length < 80) {
    throw new Error("Chưa có bản sạch để polish theo chỉnh sửa");
  }

  const prefs = await writingPrefsForArticle(article);
  const prefsBlock = formatWritingPrefsPrompt(prefs);
  const note =
    editNote?.trim() ||
    (await import("@/lib/tfes/desk-state")).parseDeskJson(article.deskJson).editNote ||
    "";

  try {
    const polishedRaw = await chatCompletion(
      [
        { role: "system", content: getSystemPrompt(article.domain) },
        {
          role: "user",
          content: buildPipelinePrompt(
            "finalize-human-polish",
            appendContext(
              clipText(rawClean, 18_000),
              note ? `### Ghi chú biên tập (người)\n${note}` : null,
              priorPipelineSupportBlock(article),
              `Chủ đề: ${article.topic ?? ""}`,
            ),
            prefsBlock,
            shapeBlockFor(article),
          ),
        },
      ],
      { maxTokens: cleanGenMaxTokens(prefs.targetWordCount), temperature: 0.25, reasoningEffort: "low" },
    );

    let polished = toReaderCleanPublish(
      sanitizeEditorialBody(stripPipelineMarks(polishedRaw)),
    );
    if (polished.length < 80 || countWords(polished) + 120 < countWords(rawClean)) {
      // Tôn trọng bản người nếu model rút quá nhiều
      polished = toReaderCleanPublish(sanitizeEditorialBody(rawClean));
    }

    const { mergeDeskJson } = await import("@/lib/tfes/desk-state");
    polished = `${polished}\n\n${CLEAN_POLISH_MARK}\n${HUMAN_EDIT_MARK}`.trim();

    const title = stripInsightLevelLabels(
      polished.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? article.topic ?? "Untitled",
    );

    const nextKr = (article.knowledgeRecord ?? "")
      .replace(/\n*##\s*Final Verification \(pipeline\)[\s\S]*?(?=\n##\s*Reader Simulation|$)/i, "")
      .replace(/\n*##\s*Reader Simulation[\s\S]*$/i, "")
      .replaceAll(FINAL_REVIEW_DONE_MARK, "")
      .replaceAll(READER_SIM_DONE_MARK, "")
      .trim();
    const articlePatch = {
        cleanPublish: polished,
        title,
        knowledgeRecord: nextKr,
        errorMessage: null,
        deskJson: mergeDeskJson(article.deskJson, {
          editNote: note || undefined,
          editedAt: new Date().toISOString(),
        }),
      };
    const invalidateStates = new Set<WorkflowState>([
      WorkflowState.FINAL_REVIEWED,
      WorkflowState.POLISHED,
      WorkflowState.READER_SIMULATED,
      WorkflowState.PUBLISH_READY,
      WorkflowState.MINOR_REVISION_REQUIRED,
    ]);
    if (invalidateStates.has(article.workflowState)) {
      return transitionArticle({
        articleId,
        expectedState: article.workflowState,
        expectedVersion: article.workflowVersion,
        to: WorkflowState.MINOR_REVISION_REQUIRED,
        action: "human-polish-invalidated-final-review",
        success: false,
        articlePatch,
        artifact: { type: ArtifactType.PUBLISH_PACKAGE, content: polished },
      });
    }
    return patchWorkflowArticle({
      articleId,
      expectedState: article.workflowState,
      expectedVersion: article.workflowVersion,
      action: "human-polish",
      articlePatch,
      artifact: { type: ArtifactType.PUBLISH_PACKAGE, content: polished },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await patchWorkflowArticle({
        articleId,
        action: "human-polish-error",
        success: false,
        expectedState: article.workflowState,
        expectedVersion: article.workflowVersion,
        articlePatch: { errorMessage: message.slice(0, 500) },
      });
    } catch {
      // A concurrent transition won the optimistic lock; never overwrite it with stale error state.
    }
    throw err instanceof Error ? err : new Error(message);
  }
}

/** Lưu xác nhận Fact-check người (claim cards). */
export async function saveFactHumanVerdicts(
  articleId: string,
  claims: Array<{ id: string; humanDisposition: "fixed" | "accept" | "pending"; note?: string }>,
): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({ where: { id: articleId } });
  const { mergeDeskJson } = await import("@/lib/tfes/desk-state");
  return patchWorkflowArticle({
    articleId,
    expectedState: article.workflowState,
    expectedVersion: article.workflowVersion,
    action: "save-fact-human-verdicts",
    articlePatch: {
      deskJson: mergeDeskJson(article.deskJson, {
        factClaims: claims,
        factAckAt: new Date().toISOString(),
      }),
    },
  });
}
