import {
  ArtifactType,
  UserRole,
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
  HUMAN_REVIEW_DONE_MARK,
  HUMAN_REVIEW_PENDING_MARK,
  FINAL_REVIEW_DONE_MARK,
  INSIGHT_DECISION_MARK,
  INSIGHT_DONE_MARK,
  INSIGHT_GATE_MARK,
  mergeKnowledgeWithPriorReview,
  parseFullOutput,
  POST_REVISION_REVIEW_MARK,
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
  countBlockingFactClaims,
  isFactRemediationExhausted,
  isBlockingFactClaim,
  MAX_FACT_REMEDIATION_RETRIES,
  parseFactClaims,
  summarizeFactCheck,
  verificationStatus,
} from "@/lib/tfes/fact-ledger";
import {
  MAX_FINAL_VERIFICATION_FORMAT_RETRIES,
  MAX_REVISION_REMEDIATION_RETRIES,
  isRevisionRemediationExhausted,
} from "@/lib/tfes/retry-policy";
import {
  applyHumanReviewToKnowledge,
  humanReviewSupportBlock,
  isAwaitingHumanReview,
  parseEditorialFindings,
  withHumanReviewPendingMark,
  type HumanReviewPayload,
} from "@/lib/tfes/human-review";
import { inspectEditorialReview } from "@/lib/tfes/editorial-review-gate";
import { parseEditorialGateFailures } from "@/lib/tfes/editorial-checklist";
import {
  buildRevisionFeedbackBlock,
  reviewDraftClipChars,
  withoutFinalVerification,
} from "@/lib/tfes/review-context";
import {
  buildConvergenceTelemetry,
  readTelemetryScore,
} from "@/lib/tfes/convergence-telemetry";
import { evaluateFinalMinorGuard } from "@/lib/tfes/final-minor-guard";
import {
  candidatesInCurrentCycle,
  cycleIdFor,
  evaluateCandidateLock,
  latestCycleAnchor,
  selectBestCandidate,
  type BestCandidateReference,
  type CycleAnchor,
} from "@/lib/tfes/best-candidate-lock";
import { buildRemediationTelemetry } from "@/lib/tfes/remediation-telemetry";
import { getDeploymentVersion } from "@/lib/deployment-version";
import { finalizePhaseOf } from "@/lib/tfes/finalize-phase";
import {
  countRemediationsInCurrentCycle,
  REMEDIATION_CYCLE_ANCHOR_ACTIONS,
} from "@/lib/tfes/remediation-budget";
import {
  assertExpectedWorkflowVersion,
  prepareManualDraftRecovery,
} from "@/lib/tfes/manual-draft-recovery";
import {
  minorPreserveInstructions,
  parseMinorPreserveOutput,
} from "@/lib/tfes/minor-preserve-prompt";
import { evaluateRegressionAutoAckBrake } from "@/lib/tfes/regression-auto-ack-brake";
import {
  buildPromptExecutionTelemetry,
  resolvePromptDescriptor,
} from "@/lib/tfes/prompt-registry";
import {
  buildEditorialDiagnosisContextV2,
  buildEditorialDiagnosisPromptV2,
  buildLockVerifierContextV2,
  buildLockVerifierPromptV2,
  buildMinorRemediationContextV2,
  buildMinorRemediationPromptV2,
} from "@/lib/tfes/prompts-v2";
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
  createdById?: string | null,
): Promise<string> {
  const { buildEditorialMemoryBlock } = await import("@/lib/tfes/editorial-memory");
  let accessScope: { mode: "admin" } | { mode: "owner"; userId: string } = { mode: "admin" };
  if (createdById) {
    const creator = await prisma.user.findUnique({
      where: { id: createdById },
      select: { role: true },
    });
    if (creator?.role !== UserRole.ADMIN) {
      accessScope = { mode: "owner", userId: createdById };
    }
  }
  return buildEditorialMemoryBlock(domain, { seriesId, accessScope });
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

/** Live remediation budget for the current recovery cycle; lifetime stays in transition history. */
async function remediationBudgetForRun(input: {
  articleId: string;
  workflowRunId: string;
  remediationAction: string;
}) {
  const transitions = await prisma.workflowTransition.findMany({
    where: {
      articleId: input.articleId,
      workflowRunId: input.workflowRunId,
      action: {
        in: [input.remediationAction, ...REMEDIATION_CYCLE_ANCHOR_ACTIONS],
      },
    },
    select: { action: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  return countRemediationsInCurrentCycle(transitions, input.remediationAction);
}

/**
 * Best-effort read-only context for WP-V2-01 telemetry.
 * Observability failure must never change AI workflow behavior.
 */
async function convergenceContextForRun(
  articleId: string,
  workflowRunId: string,
): Promise<{
  previousEditorialScore: number | null;
  previousEditorialGateFailCount: number | null;
  previousEditorialPassed: boolean;
  rewriteCount: number | null;
  finalComparisonValid: boolean;
}> {
  try {
    const transitions = await prisma.workflowTransition.findMany({
      where: {
        articleId,
        workflowRunId,
        action: {
          in: [
            "editorial-review",
            "editorial-review-after-revision",
            "remediate-required-revision",
            "remediate-fact-check",
            "manual-draft-revision",
          ],
        },
      },
      select: { action: true, details: true, success: true },
      orderBy: { createdAt: "desc" },
    });
    const editorialIndex = transitions.findIndex(
      (transition) =>
        (transition.action === "editorial-review" ||
          transition.action === "editorial-review-after-revision") &&
        readTelemetryScore(transition.details) !== null,
    );
    const previousEditorialScore =
      editorialIndex >= 0
        ? readTelemetryScore(transitions[editorialIndex].details)
        : null;
    const previousEditorialDetails =
      editorialIndex >= 0 ? objectValue(transitions[editorialIndex].details) : null;
    const previousEditorialTelemetry = objectValue(
      previousEditorialDetails?.telemetry,
    );
    const previousEditorialGateFailCount =
      finiteNumber(previousEditorialTelemetry?.gateFailCount) ??
      finiteNumber(previousEditorialDetails?.gateFailCount);
    const previousEditorialPassed =
      editorialIndex >= 0 &&
      (transitions[editorialIndex].success === true ||
        previousEditorialTelemetry?.result === "pass");
    const draftChangedAfterEditorial =
      editorialIndex >= 0 &&
      transitions
        .slice(0, editorialIndex)
        .some((transition) =>
          [
            "remediate-required-revision",
            "remediate-fact-check",
            "manual-draft-revision",
          ].includes(transition.action),
        );
    const rewriteCount = transitions.filter(
      (transition) => transition.action === "remediate-required-revision",
    ).length;
    return {
      previousEditorialScore,
      previousEditorialGateFailCount,
      previousEditorialPassed,
      rewriteCount,
      finalComparisonValid:
        previousEditorialScore !== null && !draftChangedAfterEditorial,
    };
  } catch {
    return {
      previousEditorialScore: null,
      previousEditorialGateFailCount: null,
      previousEditorialPassed: false,
      rewriteCount: null,
      finalComparisonValid: false,
    };
  }
}

type DraftArtifactSnapshot = {
  revision: number;
  content: string;
  metadata: unknown;
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function storedCandidateReference(details: unknown): BestCandidateReference | null {
  const candidate = objectValue(objectValue(details)?.candidateLock);
  const stored = objectValue(candidate?.candidate);
  const draftRevision = finiteNumber(stored?.draftRevision);
  const editorialScore = finiteNumber(stored?.editorialScore);
  const reviewedAt = typeof stored?.reviewedAt === "string" ? stored.reviewedAt : null;
  if (draftRevision === null || editorialScore === null || !reviewedAt) return null;
  return {
    draftRevision: Math.round(draftRevision),
    editorialScore: Math.round(editorialScore),
    gateFailCount: finiteNumber(stored?.gateFailCount),
    decision: typeof stored?.decision === "string" ? stored.decision : null,
    workflowVersion: finiteNumber(stored?.workflowVersion),
    reviewedAt,
    cycleId: typeof stored?.cycleId === "string" ? stored.cycleId : "workflow-run:start",
    cycleAnchorAction:
      stored?.cycleAnchorAction === "human-review-confirmed" ||
      stored?.cycleAnchorAction === "manual-draft-revision"
        ? stored.cycleAnchorAction
        : null,
    deploymentVersion:
      typeof stored?.deploymentVersion === "string" ? stored.deploymentVersion : null,
  };
}

/**
 * Read-only reconstruction supports pre-WP-V2-02 reviews by linking their REVIEW artifact
 * to the immutable ARTICLE_DRAFT source revision.
 */
async function bestCandidateContextForRun(
  articleId: string,
  workflowRunId: string,
): Promise<{
  best: BestCandidateReference | null;
  anchor: CycleAnchor | null;
  activeDraft: DraftArtifactSnapshot | null;
}> {
  const [transitions, reviewArtifacts, activeDraft] = await Promise.all([
    prisma.workflowTransition.findMany({
      where: {
        articleId,
        workflowRunId,
        action: {
          in: [
            "editorial-review",
            "editorial-review-after-revision",
            ...REMEDIATION_CYCLE_ANCHOR_ACTIONS,
          ],
        },
      },
      select: { action: true, details: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workflowArtifact.findMany({
      where: {
        articleId,
        workflowRunId,
        type: ArtifactType.REVIEW,
        sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
      },
      select: { sourceRevision: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workflowArtifact.findFirst({
      where: { articleId, workflowRunId, type: ArtifactType.ARTICLE_DRAFT },
      select: { revision: true, content: true, metadata: true },
      orderBy: { revision: "desc" },
    }),
  ]);

  const anchors: CycleAnchor[] = transitions
    .filter(
      (transition) =>
        transition.action === "human-review-confirmed" ||
        transition.action === "manual-draft-revision",
    )
    .map((transition) => ({
      action: transition.action as CycleAnchor["action"],
      createdAt: transition.createdAt,
    }));
  const candidates: BestCandidateReference[] = [];
  for (const transition of transitions) {
    if (
      transition.action !== "editorial-review" &&
      transition.action !== "editorial-review-after-revision"
    ) {
      continue;
    }
    const lockDetails = objectValue(objectValue(transition.details)?.candidateLock);
    if (
      lockDetails?.candidateEligible === false ||
      lockDetails?.candidateRejected === true
    ) {
      continue;
    }
    const stored = storedCandidateReference(transition.details);
    if (stored) {
      candidates.push(stored);
      continue;
    }
    const score = readTelemetryScore(transition.details);
    if (score === null) continue;
    const source = [...reviewArtifacts]
      .reverse()
      .find(
        (artifact) =>
          artifact.sourceRevision !== null &&
          artifact.createdAt.getTime() <= transition.createdAt.getTime(),
      );
    if (!source?.sourceRevision) continue;
    const details = objectValue(transition.details);
    const telemetry = objectValue(details?.telemetry);
    const anchorAtReview = latestCycleAnchor(
      anchors.filter(
        (anchor) =>
          new Date(anchor.createdAt).getTime() <= transition.createdAt.getTime(),
      ),
    );
    candidates.push({
      draftRevision: source.sourceRevision,
      editorialScore: score,
      gateFailCount:
        finiteNumber(details?.gateFailCount) ?? finiteNumber(telemetry?.gateFailCount),
      decision:
        typeof details?.decision === "string"
          ? details.decision
          : typeof telemetry?.decision === "string"
            ? telemetry.decision
            : null,
      workflowVersion: null,
      reviewedAt: transition.createdAt.toISOString(),
      cycleId: cycleIdFor(anchorAtReview),
      cycleAnchorAction: anchorAtReview?.action ?? null,
      deploymentVersion:
        typeof telemetry?.deploymentVersion === "string"
          ? telemetry.deploymentVersion
          : null,
    });
  }
  const anchor = latestCycleAnchor(anchors);
  return {
    best: selectBestCandidate(candidatesInCurrentCycle(candidates, anchors)),
    anchor,
    activeDraft,
  };
}

function promotionMetadata(input: {
  keptCandidateRevision: number;
  rejectedCandidateRevision: number | null;
  reason: "review-rejected" | "exhaustion";
}) {
  return {
    bestCandidatePromotion: {
      ...input,
      wp: "WP-V2-02",
    },
  };
}

function activeArtifactRetainsBest(
  artifact: DraftArtifactSnapshot | null,
  bestRevision: number,
): boolean {
  if (!artifact) return false;
  if (artifact.revision === bestRevision) return true;
  const promotion = objectValue(objectValue(artifact.metadata)?.bestCandidatePromotion);
  return finiteNumber(promotion?.keptCandidateRevision) === bestRevision;
}

async function restorableBestArtifact(input: {
  articleId: string;
  workflowRunId: string;
  bestRevision: number;
}): Promise<DraftArtifactSnapshot | null> {
  const artifacts = await prisma.workflowArtifact.findMany({
    where: {
      articleId: input.articleId,
      workflowRunId: input.workflowRunId,
      type: ArtifactType.ARTICLE_DRAFT,
    },
    select: { revision: true, content: true, metadata: true },
    orderBy: { revision: "desc" },
  });
  return (
    artifacts.find((artifact) => artifact.revision === input.bestRevision) ??
    artifacts.find((artifact) =>
      activeArtifactRetainsBest(artifact, input.bestRevision),
    ) ??
    null
  );
}

/** Phase routing lives in a pure module so the Fact Check loop can be asserted in tests. */

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
        const memory = await getEditorialMemory(
          article.domain,
          article.seriesId,
          article.createdById,
        );
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
      const memory = await getEditorialMemory(
        article.domain,
        article.seriesId,
        article.createdById,
      );
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
        const reviewMaxTokens = 2200;
        const editorialPrompt = resolvePromptDescriptor("editorial-diagnosis");
        const editorialLegacyContext = appendContext(
          clipText(
            article.researchBrief,
            PIPELINE_CONFIG.context.reviewResearchBriefChars,
          ),
          clipText(article.insightGate, 1_200),
          clipText(
            stripPipelineMarks(article.draft12),
            reviewDraftClipChars(article.targetWordCount),
          ),
          `Chủ đề: ${topic}`,
        );
        const editorialContext =
          editorialPrompt.promptVersion === "2.0"
            ? buildEditorialDiagnosisContextV2({
                insightPlan: article.insightGate,
                draft: stripPipelineMarks(article.draft12),
                articleShape: shapeBlockFor(article),
                maxDraftChars: reviewDraftClipChars(article.targetWordCount),
              })
            : editorialLegacyContext;
        const editorialUserPrompt =
          editorialPrompt.promptVersion === "2.0"
            ? buildEditorialDiagnosisPromptV2(editorialContext)
            : buildPipelinePrompt(
                "finalize-review",
                editorialContext,
                undefined,
                shapeBlockFor(article),
              );
        const reviewOut = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: editorialUserPrompt,
            },
          ],
          { maxTokens: reviewMaxTokens, temperature: 0.35, reasoningEffort: "low" },
        );

        const inspection = inspectEditorialReview(reviewOut);
        const reviewLlmMs = Date.now() - llmStarted;
        const gateFailures = inspection.gateFailures;
        const editorialPromptTelemetry = buildPromptExecutionTelemetry({
          descriptor: editorialPrompt,
          contextCharacterLength: editorialContext.length,
          legacyContextCharacterLength: editorialLegacyContext.length,
          defectCount: inspection.defects.length,
          malformedOutput: !inspection.machineReadable,
        });
        const reviewState = inspection.resolvedState;
        const isPostRevisionReview = (article.knowledgeRecord ?? "").includes(
          POST_REVISION_REVIEW_MARK,
        );
        const [convergenceContext, lockContext] = await Promise.all([
          convergenceContextForRun(articleId, article.workflowRunId),
          bestCandidateContextForRun(articleId, article.workflowRunId),
        ]);
        const currentDraftRevision = lockContext.activeDraft?.revision ?? null;
        const currentScore =
          typeof inspection.totalScore === "number" ? inspection.totalScore : null;
        const candidate: BestCandidateReference | null =
          currentDraftRevision !== null && currentScore !== null
            ? {
                draftRevision: currentDraftRevision,
                editorialScore: currentScore,
                gateFailCount: inspection.gateFailCount,
                decision: inspection.decision,
                workflowVersion: article.workflowVersion,
                reviewedAt: new Date().toISOString(),
                cycleId: cycleIdFor(lockContext.anchor),
                cycleAnchorAction: lockContext.anchor?.action ?? null,
                deploymentVersion: getDeploymentVersion().shortSha,
              }
            : null;
        const lockEvaluation = evaluateCandidateLock({
          config: PIPELINE_CONFIG.aiTfesV2.bestCandidateLock,
          bestBefore: lockContext.best,
          candidate,
          machineReadable:
            inspection.machineReadable && inspection.machineContract !== "invalid",
        });
        const autoAckBrake = evaluateRegressionAutoAckBrake({
          enabled:
            PIPELINE_CONFIG.aiTfesV2.regressionAutoAckBrake.enabled,
          isPostRevisionReview,
          candidateEligible: lockEvaluation.candidateEligible,
          candidateRegression: lockEvaluation.candidateRegression,
          bestScore: lockEvaluation.bestBefore?.editorialScore ?? null,
          candidateScore: currentScore,
          scoreDelta: lockEvaluation.candidateScoreDelta,
          epsilon: lockEvaluation.epsilon,
        });
        const {
          suppressAutoAck,
          ...autoAckBrakeTelemetry
        } = autoAckBrake;
        const bestArtifact =
          lockEvaluation.candidateRejected && lockEvaluation.bestBefore
            ? await restorableBestArtifact({
                articleId,
                workflowRunId: article.workflowRunId,
                bestRevision: lockEvaluation.bestBefore.draftRevision,
              })
            : null;
        const restoreStatus =
          !lockEvaluation.lockEnabled
            ? "disabled"
            : !lockEvaluation.candidateRejected
              ? "not-needed"
              : bestArtifact
                ? "restored"
                : "missing-artifact";
        const keptCandidateRevision =
          lockEvaluation.bestAfter?.draftRevision ?? null;
        const rejectedCandidateRevision = lockEvaluation.candidateRejected
          ? currentDraftRevision
          : null;
        const convergence = buildConvergenceTelemetry({
          observation: "editorial",
          currentScore: inspection.totalScore,
          previousEditorialScore: convergenceContext.previousEditorialScore,
          isPostRevisionReview,
          rewriteCount: convergenceContext.rewriteCount,
          candidateLock: {
            bestEditorialScore:
              lockEvaluation.bestBefore?.editorialScore ??
              lockEvaluation.bestAfter?.editorialScore ??
              null,
            candidateEditorialScore: currentScore,
            candidateScoreDelta: lockEvaluation.candidateScoreDelta,
            candidateRegression: lockEvaluation.candidateRegression,
            candidateRejected: lockEvaluation.candidateRejected,
            keptCandidateRevision,
            rejectedCandidateRevision,
            epsilon: lockEvaluation.epsilon,
            lockEnabled: lockEvaluation.lockEnabled,
            acceptedDespiteRegression: lockEvaluation.acceptedDespiteRegression,
            restoreStatus,
          },
        });
        const cleanReview = reviewOut
          .replaceAll(POST_REVISION_REVIEW_MARK, "")
          .trim();

        // Sau revision: đạt → auto-ack; chưa đạt → auto xếp «nhờ AI sửa» để soft-continue
        // không bị kẹt await-human giữa vòng 9b. Lần Review đầu vẫn chờ người.
        let nextKnowledge: string;
        if (isPostRevisionReview && suppressAutoAck) {
          nextKnowledge = withHumanReviewPendingMark(cleanReview).replaceAll(
            POST_REVISION_REVIEW_MARK,
            "",
          );
        } else if (isPostRevisionReview) {
          if (reviewState === WorkflowState.EDITORIAL_REVIEWED) {
            nextKnowledge = applyHumanReviewToKnowledge(
              cleanReview,
              {
                items: [
                  {
                    id: "ack-pass",
                    disposition: "fixed",
                    note: "Auto-ack sau revision re-review (điểm/gate đạt)",
                  },
                ],
                notes: "Re-review đạt — bỏ qua pause human.",
              },
              [],
            ).replaceAll(POST_REVISION_REVIEW_MARK, "");
          } else {
            const findings = parseEditorialFindings(
              withHumanReviewPendingMark(cleanReview),
            );
            const fixItems =
              findings.length > 0
                ? findings.map((f) => ({
                    id: f.id,
                    disposition: "fixed" as const,
                    note: "Auto re-fix sau re-review",
                  }))
                : [
                    {
                      id: "required-revisions",
                      disposition: "fixed" as const,
                      note: "Auto re-fix sau re-review",
                    },
                  ];
            nextKnowledge = applyHumanReviewToKnowledge(
              cleanReview,
              {
                items: fixItems,
                notes: inspection.failureReasons.length
                  ? `Re-review chưa đạt — ${inspection.failureReasons.join(" · ")}`
                  : "Re-review chưa đạt — tiếp tục remediation.",
              },
              findings,
            ).replaceAll(POST_REVISION_REVIEW_MARK, "");
          }
        } else {
          nextKnowledge = withHumanReviewPendingMark(cleanReview).replaceAll(
            POST_REVISION_REVIEW_MARK,
            "",
          );
        }

        const restoreFailed = restoreStatus === "missing-artifact";
        const effectiveReviewState =
          restoreFailed && reviewState === WorkflowState.EDITORIAL_REVIEWED
            ? WorkflowState.MINOR_REVISION_REQUIRED
            : reviewState;
        const transitioned = await commitTransition({
          to: effectiveReviewState,
          action: isPostRevisionReview
            ? "editorial-review-after-revision"
            : "editorial-review",
          success:
            reviewState === WorkflowState.EDITORIAL_REVIEWED &&
            !lockEvaluation.candidateRejected &&
            !suppressAutoAck &&
            !restoreFailed,
          articlePatch: {
            knowledgeRecord: nextKnowledge,
            ...(bestArtifact
              ? {
                  draft12: `${bestArtifact.content}\n\n${WRITE_DONE_MARK}`,
                  factCheck: null,
                  cleanPublish: null,
                  heroBrief: null,
                }
              : {}),
            errorMessage:
              restoreFailed
                ? "Best Candidate Lock không tìm thấy draft artifact cần restore; candidate không được phép publish."
                : suppressAutoAck
                  ? lockEvaluation.candidateRejected
                    ? `Regression Auto-ack Brake đã dừng progression; best revision ${bestArtifact?.revision ?? "unknown"} đang active và cần Human Review.`
                    : autoAckBrakeTelemetry.reason === "regression"
                      ? "Regression Auto-ack Brake đã dừng progression; Candidate Lock đang OFF nên candidate hiện tại được giữ để Human Review."
                      : "Regression Auto-ack Brake đã dừng progression vì review không đủ dữ liệu an toàn; cần Human Review."
                : lockEvaluation.candidateRejected
                  ? `Best Candidate Lock đã reject revision ${currentDraftRevision ?? "unknown"} và restore revision ${bestArtifact?.revision ?? "unknown"}.`
                  : reviewState === WorkflowState.EDITORIAL_REVIEWED
                ? null
                : inspection.failureReasons.length
                  ? `Editorial Review chưa đạt — ${inspection.failureReasons.join(" · ")}.`
                  : null,
          },
          details: {
            ...inspection,
            isPostRevisionReview,
            autoHumanAck:
              isPostRevisionReview && !suppressAutoAck,
            autoAckBrake: autoAckBrakeTelemetry,
            candidateLock: {
              candidate,
              bestBefore: lockEvaluation.bestBefore,
              bestAfter: lockEvaluation.bestAfter,
              candidateEligible: lockEvaluation.candidateEligible,
              candidateScoreDelta: lockEvaluation.candidateScoreDelta,
              candidateRegression: lockEvaluation.candidateRegression,
              candidateRejected: lockEvaluation.candidateRejected,
              acceptedDespiteRegression: lockEvaluation.acceptedDespiteRegression,
              keptCandidateRevision,
              rejectedCandidateRevision,
              epsilon: lockEvaluation.epsilon,
              lockEnabled: lockEvaluation.lockEnabled,
              attemptConsumed: isPostRevisionReview,
              reason: lockEvaluation.reason,
              restoreStatus,
            },
            telemetry: buildRemediationTelemetry({
              articleId,
              workflowState: effectiveReviewState,
              transitionName: isPostRevisionReview
                ? "editorial-review-after-revision"
                : "editorial-review",
              draft: stripPipelineMarks(article.draft12),
              result:
                lockEvaluation.candidateRejected ||
                suppressAutoAck ||
                restoreFailed
                  ? "fail"
                  : reviewState === WorkflowState.EDITORIAL_REVIEWED
                    ? "pass"
                    : "fail",
              attempt: isPostRevisionReview ? 2 : 1,
              gateFailCount: inspection.gateFailCount,
              gateFailures,
              failureReasons: [
                ...inspection.failureReasons,
                ...(lockEvaluation.candidateRejected
                  ? [
                      `Candidate revision ${currentDraftRevision ?? "unknown"} rejected by Best Candidate Lock`,
                    ]
                  : []),
                ...(restoreFailed ? ["Best candidate artifact missing"] : []),
                ...(suppressAutoAck
                  ? ["Post-revision auto-ack suppressed; Human Review required"]
                  : []),
              ],
              totalScore: inspection.totalScore,
              machineReadable: inspection.machineReadable,
              machineContract: inspection.machineContract,
              decision: inspection.decision,
              maxTokens: reviewMaxTokens,
              llmMs: reviewLlmMs,
              errorClass:
                lockEvaluation.candidateRejected ||
                suppressAutoAck ||
                restoreFailed
                  ? "content"
                  : inspection.machineReadable && inspection.machineContract !== "invalid"
                  ? inspection.resolvedState === WorkflowState.EDITORIAL_REVIEWED
                    ? null
                    : "content"
                  : "parser",
              convergence,
              autoAckBrake: autoAckBrakeTelemetry,
              prompt: editorialPromptTelemetry,
            }),
          },
          artifacts: [
            {
              type: ArtifactType.REVIEW,
              content: cleanReview,
              sourceRevision: currentDraftRevision,
              sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
            },
            ...(bestArtifact
              ? [
                  {
                    type: ArtifactType.ARTICLE_DRAFT,
                    content: bestArtifact.content,
                    sourceRevision: bestArtifact.revision,
                    sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
                    metadata: promotionMetadata({
                      keptCandidateRevision:
                        lockEvaluation.bestBefore?.draftRevision ??
                        bestArtifact.revision,
                      rejectedCandidateRevision,
                      reason: "review-rejected",
                    }),
                  },
                ]
              : []),
          ],
        });
        return withTimings(transitioned, {
          llmMs: reviewLlmMs,
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
        const revisionBudget = await remediationBudgetForRun({
          articleId,
          workflowRunId: article.workflowRunId,
          remediationAction: "remediate-required-revision",
        });
        const remediationAttempts = revisionBudget.cycleCount;
        const [rewriteConvergenceContext, exhaustionLockContext] = await Promise.all([
          convergenceContextForRun(articleId, article.workflowRunId),
          bestCandidateContextForRun(articleId, article.workflowRunId),
        ]);
        if (remediationAttempts >= MAX_REVISION_REMEDIATION_RETRIES) {
          const lockEnabled = PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.enabled;
          const best = exhaustionLockContext.best;
          const alreadyRetained =
            best !== null &&
            activeArtifactRetainsBest(
              exhaustionLockContext.activeDraft,
              best.draftRevision,
            );
          const bestArtifact =
            lockEnabled && best && !alreadyRetained
              ? await restorableBestArtifact({
                  articleId,
                  workflowRunId: article.workflowRunId,
                  bestRevision: best.draftRevision,
                })
              : null;
          const bestRetainedAtExhaustion = !lockEnabled
            ? null
            : !best
              ? null
              : alreadyRetained || Boolean(bestArtifact);
          const restoreStatus = !lockEnabled
            ? "disabled"
            : alreadyRetained || !best
              ? "not-needed"
              : bestArtifact
                ? "restored"
                : "missing-artifact";
          const activeScore = rewriteConvergenceContext.previousEditorialScore;
          const candidateScoreDelta =
            activeScore !== null && best
              ? activeScore - best.editorialScore
              : null;
          const stopped = await commitPatch({
            action: "revision-remediation-exhausted",
            success: false,
            articlePatch: {
              ...(bestArtifact
                ? {
                    draft12: `${bestArtifact.content}\n\n${WRITE_DONE_MARK}`,
                    factCheck: null,
                    cleanPublish: null,
                    heroBrief: null,
                  }
                : {}),
              errorMessage:
                restoreStatus === "missing-artifact"
                  ? "Revision exhausted; Best Candidate Lock không tìm thấy artifact để restore. Candidate hiện tại bị chặn publish."
                  : lockEnabled && bestRetainedAtExhaustion
                    ? `Revision chưa đạt sau ${MAX_REVISION_REMEDIATION_RETRIES} lần remediation — ` +
                      "đã giữ candidate tốt nhất; cần editor sửa tay hoặc làm lại workflow."
                    : `Revision chưa đạt sau ${MAX_REVISION_REMEDIATION_RETRIES} lần remediation — ` +
                      "cần editor sửa tay hoặc làm lại workflow.",
            },
            details: {
              remediationAttempts,
              lifetimeRemediationCount: revisionBudget.lifetimeCount,
              cycleRemediationCount: revisionBudget.cycleCount,
              cycleAnchorAction: revisionBudget.cycleAnchorAction,
              revisionState: article.workflowState,
              candidateLock: {
                best,
                lockEnabled,
                epsilon: PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.epsilon,
                bestRetainedAtExhaustion,
                restoreStatus,
                keptCandidateRevision: best?.draftRevision ?? null,
                activeDraftRevision:
                  exhaustionLockContext.activeDraft?.revision ?? null,
              },
              telemetry: buildRemediationTelemetry({
                articleId,
                workflowState: article.workflowState,
                transitionName: "revision-remediation-exhausted",
                draft: stripPipelineMarks(article.draft12),
                result: "exhausted",
                attempt: remediationAttempts,
                remediationCount: remediationAttempts,
                lifetimeRemediationCount: revisionBudget.lifetimeCount,
                cycleRemediationCount: revisionBudget.cycleCount,
                failureReasons: [article.errorMessage ?? "Revision remediation exhausted"],
                errorClass: "content",
                convergence: buildConvergenceTelemetry({
                  observation: "rewrite",
                  previousEditorialScore:
                    rewriteConvergenceContext.previousEditorialScore,
                  rewriteCount: revisionBudget.lifetimeCount,
                  candidateLock: {
                    bestEditorialScore: best?.editorialScore ?? null,
                    candidateEditorialScore: activeScore,
                    candidateScoreDelta,
                    candidateRegression:
                      candidateScoreDelta !== null
                        ? candidateScoreDelta <
                          -PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.epsilon
                        : null,
                    candidateRejected: false,
                    keptCandidateRevision: best?.draftRevision ?? null,
                    rejectedCandidateRevision: null,
                    epsilon: PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.epsilon,
                    lockEnabled,
                    acceptedDespiteRegression: false,
                    bestRetainedAtExhaustion,
                    restoreStatus,
                  },
                }),
              }),
            },
            ...(bestArtifact
              ? {
                  artifact: {
                    type: ArtifactType.ARTICLE_DRAFT,
                    content: bestArtifact.content,
                    sourceRevision: bestArtifact.revision,
                    sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
                    metadata: promotionMetadata({
                      keptCandidateRevision:
                        best?.draftRevision ?? bestArtifact.revision,
                      rejectedCandidateRevision:
                        exhaustionLockContext.activeDraft?.revision ?? null,
                      reason: "exhaustion",
                    }),
                  },
                }
              : {}),
          });
          return withTimings(stopped, {
            finalizePhase: "revision-remediation-exhausted",
          });
        }

        if (
          PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.enabled &&
          exhaustionLockContext.best
        ) {
          const restorable = await restorableBestArtifact({
            articleId,
            workflowRunId: article.workflowRunId,
            bestRevision: exhaustionLockContext.best.draftRevision,
          });
          if (!restorable) {
            const blocked = await commitPatch({
              action: "best-candidate-lock-artifact-missing",
              success: false,
              articlePatch: {
                errorMessage:
                  "Best Candidate Lock đã chặn remediation vì artifact tốt nhất bị thiếu; active draft không bị thay đổi.",
              },
              details: {
                bestCandidate: exhaustionLockContext.best,
                lockEnabled: true,
                epsilon: PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.epsilon,
                telemetry: buildRemediationTelemetry({
                  articleId,
                  workflowState: article.workflowState,
                  transitionName: "best-candidate-lock-artifact-missing",
                  draft: stripPipelineMarks(article.draft12),
                  result: "error",
                  errorClass: "runtime",
                  failureReasons: ["Best candidate artifact missing"],
                  convergence: buildConvergenceTelemetry({
                    observation: "rewrite",
                    previousEditorialScore:
                      rewriteConvergenceContext.previousEditorialScore,
                    rewriteCount: revisionBudget.lifetimeCount,
                    candidateLock: {
                      bestEditorialScore:
                        exhaustionLockContext.best.editorialScore,
                      candidateEditorialScore:
                        rewriteConvergenceContext.previousEditorialScore,
                      candidateScoreDelta: null,
                      candidateRegression: null,
                      candidateRejected: false,
                      keptCandidateRevision:
                        exhaustionLockContext.best.draftRevision,
                      rejectedCandidateRevision: null,
                      epsilon: PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.epsilon,
                      lockEnabled: true,
                      acceptedDespiteRegression: false,
                      restoreStatus: "missing-artifact",
                    },
                  }),
                }),
              },
            });
            return withTimings(blocked, {
              finalizePhase: "best-candidate-lock-artifact-missing",
            });
          }
        }

        const llmStarted = Date.now();
        const remediationMaxTokens = cleanGenMaxTokens(article.targetWordCount);
        const configuredMinorPrompt = resolvePromptDescriptor("minor-remediation");
        const minorPrompt =
          article.workflowState === WorkflowState.MINOR_REVISION_REQUIRED
            ? configuredMinorPrompt
            : resolvePromptDescriptor("minor-remediation", { enabled: false });
        const minorPreservePrompt = minorPreserveInstructions({
          enabled:
            minorPrompt.promptVersion === "1.6" &&
            PIPELINE_CONFIG.aiTfesV2.minorPreservePrompt.enabled,
          revisionSeverity: article.workflowState,
          version:
            PIPELINE_CONFIG.aiTfesV2.minorPreservePrompt.version,
        });
        const previousDraftRevision = await latestArtifactRevision(
          articleId,
          ArtifactType.ARTICLE_DRAFT,
        );
        // Feedback mới nhất đứng đầu: 9b append Required Revisions vào cuối knowledgeRecord,
        // nên cách cắt theo prefix trước đây làm mất đúng phần cần sửa.
        const revisionFeedback = appendContext(
          buildRevisionFeedbackBlock(article),
          priorPipelineSupportBlock({
            knowledgeRecord: withoutFinalVerification(article.knowledgeRecord),
            includeFact: false,
          }),
        );
        const revisionLegacyContext = appendContext(
          `Revision state: ${article.workflowState}`,
          revisionFeedback,
          clipText(article.researchBrief, 4_000),
          clipText(article.insightGate, 2_000),
          clipText(
            stripPipelineMarks(article.draft12),
            reviewDraftClipChars(article.targetWordCount),
          ),
          clipText(article.factCheck, 5_000),
          `Chủ đề: ${topic}`,
          minorPreservePrompt,
        );
        const currentEditorial = inspectEditorialReview(
          extractEditorialReview(article.knowledgeRecord),
        );
        const blockingFactClaims = parseFactClaims(article.factCheck)
          .filter(isBlockingFactClaim)
          .slice(0, 8)
          .map((claim) => ({
            id: claim.id,
            verdict: claim.aiVerdict,
            action: claim.action,
            source: claim.source,
          }));
        const minorV2Context = buildMinorRemediationContextV2({
          defects: currentEditorial.defects.filter(
            (defect) => defect.severity === "MINOR",
          ),
          requiredActions: currentEditorial.requiredActions,
          fallbackFeedback: revisionFeedback,
          draft: stripPipelineMarks(article.draft12),
          evidenceSummary: {
            fact: summarizeFactCheck(article.factCheck),
            blockingClaims: blockingFactClaims,
          },
          maxDraftChars: reviewDraftClipChars(article.targetWordCount),
        });
        const revisionContext =
          minorPrompt.promptVersion === "2.0"
            ? minorV2Context.context
            : revisionLegacyContext;
        const revisionUserPrompt =
          minorPrompt.promptVersion === "2.0"
            ? buildMinorRemediationPromptV2(revisionContext)
            : buildPipelinePrompt(
                "finalize-revision-remediate",
                revisionContext,
                undefined,
                shapeBlockFor(article),
              );
        const repairedRaw = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: revisionUserPrompt,
            },
          ],
          {
            maxTokens: remediationMaxTokens,
            temperature: 0.25,
            reasoningEffort: "low",
          },
        );
        const preserveMetadataExpected =
          minorPrompt.promptVersion === "2.0" || Boolean(minorPreservePrompt);
        const preserveOutput = preserveMetadataExpected
          ? parseMinorPreserveOutput(repairedRaw)
          : {
              draft: repairedRaw,
              changedSections: [],
              unchangedSections: [],
              metadataReadable: false,
            };
        const repairedDraft = sanitizeEditorialBody(
          stripPipelineMarks(preserveOutput.draft),
        );
        const remediationLlmMs = Date.now() - llmStarted;
        const minorPreserveTelemetry = preserveMetadataExpected
          ? {
              minorPreservePromptVersion:
                minorPrompt.promptVersion === "2.0"
                  ? "minor-remediation@2.0"
                  : PIPELINE_CONFIG.aiTfesV2.minorPreservePrompt.version,
              changedSectionCount: preserveOutput.metadataReadable
                ? preserveOutput.changedSections.length
                : null,
              unchangedSectionCount: preserveOutput.metadataReadable
                ? preserveOutput.unchangedSections.length
                : null,
              preserveMetadataReadable: preserveOutput.metadataReadable,
            }
          : null;
        const minorPromptTelemetry = buildPromptExecutionTelemetry({
          descriptor: minorPrompt,
          contextCharacterLength: revisionContext.length,
          legacyContextCharacterLength: revisionLegacyContext.length,
          defectCount: currentEditorial.defects.length,
          ...(minorPrompt.promptVersion === "2.0"
            ? { remediationMedium: "full-draft-preserve" as const }
            : {}),
        });
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
          .replaceAll(REVIEW_DONE_MARK, "")
          .replaceAll(HUMAN_REVIEW_DONE_MARK, "")
          .replaceAll(HUMAN_REVIEW_PENDING_MARK, "")
          .replaceAll(POST_REVISION_REVIEW_MARK, "")
          .trim();
        const transitioned = await commitTransition({
          // Revision xong → về DRAFTED, buộc chạy lại bước 8 (Review) trước Fact.
          to: WorkflowState.DRAFTED,
          action: "remediate-required-revision",
          articlePatch: {
            draft12: `${repairedDraft}\n\n${WRITE_DONE_MARK}`,
            factCheck: null,
            knowledgeRecord: `${retainedReview}\n\n${POST_REVISION_REVIEW_MARK}`.trim(),
            cleanPublish: null,
            heroBrief: null,
            errorMessage: null,
          },
          details: {
            revisionSeverity: article.workflowState,
            invalidatedFactCheck: Boolean(article.factCheck?.trim()),
            invalidatedFinalReview: Boolean(article.knowledgeRecord?.includes(FINAL_REVIEW_DONE_MARK)),
            previousDraftRevision,
            requiresReReview: true,
            ...(minorPreserveTelemetry
              ? { minorPreserve: minorPreserveTelemetry }
              : {}),
            lifetimeRemediationCount: revisionBudget.lifetimeCount + 1,
            cycleRemediationCount: remediationAttempts + 1,
            cycleAnchorAction: revisionBudget.cycleAnchorAction,
            telemetry: buildRemediationTelemetry({
              articleId,
              workflowState: WorkflowState.DRAFTED,
              transitionName: "remediate-required-revision",
              draft: repairedDraft,
              result: "retry",
              attempt: remediationAttempts + 1,
              retryCount: remediationAttempts + 1,
              remediationCount: remediationAttempts + 1,
              lifetimeRemediationCount: revisionBudget.lifetimeCount + 1,
              cycleRemediationCount: remediationAttempts + 1,
              maxTokens: remediationMaxTokens,
              llmMs: remediationLlmMs,
              errorClass: "content",
              convergence: buildConvergenceTelemetry({
                observation: "rewrite",
                previousEditorialScore:
                  rewriteConvergenceContext.previousEditorialScore,
                rewriteCount: revisionBudget.lifetimeCount + 1,
              }),
              ...(minorPreserveTelemetry
                ? { minorPreserve: minorPreserveTelemetry }
                : {}),
              prompt: minorPromptTelemetry,
            }),
          },
          artifact: {
            type: ArtifactType.ARTICLE_DRAFT,
            content: repairedDraft,
            sourceRevision: previousDraftRevision,
            sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
          },
        });
        return withTimings(transitioned, {
          llmMs: remediationLlmMs,
          finalizePhase: "revision-remediate",
        });
      }

      // FACT_CHECK_FAILED: sửa exact Article revision trước khi kiểm tra lại.
      if (finPhase === "fact-remediate") {
        const factBudget = await remediationBudgetForRun({
          articleId,
          workflowRunId: article.workflowRunId,
          remediationAction: "remediate-fact-check",
        });
        const remediationAttempts = factBudget.cycleCount;
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
              lifetimeRemediationCount: factBudget.lifetimeCount,
              cycleRemediationCount: factBudget.cycleCount,
              cycleAnchorAction: factBudget.cycleAnchorAction,
              verificationStatus: verificationStatus(article.factCheck),
              telemetry: buildRemediationTelemetry({
                articleId,
                workflowState: article.workflowState,
                transitionName: "fact-remediation-exhausted",
                draft: stripPipelineMarks(article.draft12),
                result: "exhausted",
                attempt: remediationAttempts,
                remediationCount: remediationAttempts,
                lifetimeRemediationCount: factBudget.lifetimeCount,
                cycleRemediationCount: factBudget.cycleCount,
                failureReasons: [article.errorMessage ?? "Fact remediation exhausted"],
                errorClass: "content",
              }),
            },
          });
          return withTimings(stopped, {
            finalizePhase: "fact-remediation-exhausted",
          });
        }

        const llmStarted = Date.now();
        const remediationMaxTokens = cleanGenMaxTokens(article.targetWordCount);
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
          {
            maxTokens: remediationMaxTokens,
            temperature: 0.2,
            reasoningEffort: "low",
          },
        );
        const repairedDraft = sanitizeEditorialBody(stripPipelineMarks(repairedRaw));
        const remediationLlmMs = Date.now() - llmStarted;
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
            lifetimeRemediationCount: factBudget.lifetimeCount + 1,
            cycleRemediationCount: remediationAttempts + 1,
            cycleAnchorAction: factBudget.cycleAnchorAction,
            telemetry: buildRemediationTelemetry({
              articleId,
              workflowState: WorkflowState.EDITORIAL_REVIEWED,
              transitionName: "remediate-fact-check",
              draft: repairedDraft,
              result: "retry",
              attempt: remediationAttempts + 1,
              retryCount: remediationAttempts + 1,
              remediationCount: remediationAttempts + 1,
              lifetimeRemediationCount: factBudget.lifetimeCount + 1,
              cycleRemediationCount: remediationAttempts + 1,
              maxTokens: remediationMaxTokens,
              llmMs: remediationLlmMs,
              errorClass: "content",
            }),
          },
          artifact: {
            type: ArtifactType.ARTICLE_DRAFT,
            content: repairedDraft,
            sourceRevision: previousDraftRevision,
            sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
          },
        });
        return withTimings(transitioned, {
          llmMs: remediationLlmMs,
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

        const factLlmMs = Date.now() - llmStarted;
        const parsed = parseFullOutput(finalizeA);
        const factCheckContent = parsed.factCheck ?? finalizeA;
        const statusPassed = /^PASSED$/i.test(verificationStatus(factCheckContent));
        const blockingClaims = countBlockingFactClaims(factCheckContent);
        const passed = statusPassed && blockingClaims === 0;
        const factSummary = summarizeFactCheck(factCheckContent);
        const factBudget = await remediationBudgetForRun({
          articleId,
          workflowRunId: article.workflowRunId,
          remediationAction: "fact-check",
        });
        const factAttempt = factBudget.cycleCount + 1;
        const factFailureReason = passed
          ? null
          : !statusPassed
            ? "Fact Check chưa PASSED — cần sửa claim hoặc chạy lại Fact Check."
            : `Fact Check còn ${blockingClaims} blocking claim — không chấp nhận PASSED khi vẫn có Unsupported/Contradicted/Unverifiable.`;
        const transitioned = await commitTransition({
          to: passed ? WorkflowState.FACT_CHECKED : WorkflowState.FACT_CHECK_FAILED,
          action: "fact-check",
          success: passed,
          articlePatch: {
            factCheck: factCheckContent,
            errorMessage: factFailureReason,
          },
          details: {
            verificationStatus: verificationStatus(factCheckContent),
            blockingClaims,
            lifetimeRemediationCount: factBudget.lifetimeCount + 1,
            cycleRemediationCount: factAttempt,
            cycleAnchorAction: factBudget.cycleAnchorAction,
            telemetry: buildRemediationTelemetry({
              articleId,
              workflowState: passed
                ? WorkflowState.FACT_CHECKED
                : WorkflowState.FACT_CHECK_FAILED,
              transitionName: "fact-check",
              draft: stripPipelineMarks(article.draft12),
              result: passed ? "pass" : "fail",
              attempt: factAttempt,
              retryCount: factAttempt,
              lifetimeRemediationCount: factBudget.lifetimeCount + 1,
              cycleRemediationCount: factAttempt,
              decision: factSummary.verdict ?? "UNPARSED",
              failureReasons: factFailureReason ? [factFailureReason] : [],
              machineReadable: !factSummary.malformedOutput,
              machineContract: factSummary.malformedOutput ? "invalid" : "fact-ledger",
              maxTokens: 2500,
              llmMs: factLlmMs,
              errorClass: passed
                ? null
                : factSummary.malformedOutput
                  ? "parser"
                  : "content",
              fact: factSummary,
            }),
          },
          artifact: {
            type: ArtifactType.FACT_CHECK,
            content: factCheckContent,
            sourceRevision: await latestArtifactRevision(articleId, ArtifactType.ARTICLE_DRAFT),
            sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
          },
        });
        return withTimings(transitioned, {
          llmMs: factLlmMs,
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
            details: {
              phase: "pre-final-verify",
              goldBar: true,
              telemetry: buildRemediationTelemetry({
                articleId,
                workflowState: WorkflowState.MINOR_REVISION_REQUIRED,
                transitionName: "pre-final-verification-gold-bar",
                draft: stripPipelineMarks(article.draft12),
                result: "fail",
                failureReasons: [msg],
                errorClass: "content",
              }),
            },
          });
          return withTimings(transitioned, {
            finalizePhase: "final-verify-precheck-fail",
          });
        }

        const llmStarted = Date.now();
        const lockPrompt = resolvePromptDescriptor("lock-verifier");
        const finalVerifyMaxTokens =
          lockPrompt.promptVersion === "2.0" ? 1500 : 2200;
        const finalConvergenceContext = await convergenceContextForRun(
          articleId,
          article.workflowRunId,
        );
        const rescoreHint =
          lockPrompt.promptVersion === "1.6" &&
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
        const finalLegacyContext = appendContext(
          clipText(extractEditorialReview(article.knowledgeRecord), 3_000),
          clipText(article.factCheck, 4_000),
          clipText(
            stripPipelineMarks(article.draft12),
            reviewDraftClipChars(article.targetWordCount),
          ),
          `Chủ đề: ${topic}`,
          rescoreHint,
        );
        const editorialLockInspection = inspectEditorialReview(
          extractEditorialReview(article.knowledgeRecord),
        );
        const lockContext =
          lockPrompt.promptVersion === "2.0"
            ? buildLockVerifierContextV2({
                editorialResult: {
                  score: editorialLockInspection.totalScore,
                  insightScore: editorialLockInspection.insightScore,
                  passed:
                    editorialLockInspection.resolvedState ===
                    WorkflowState.EDITORIAL_REVIEWED,
                  gateFailures: editorialLockInspection.gateFailures,
                  defects: editorialLockInspection.defects,
                  requiredActions: editorialLockInspection.requiredActions,
                },
                factSummary: summarizeFactCheck(article.factCheck),
                blockingClaims: parseFactClaims(article.factCheck)
                  .filter(isBlockingFactClaim)
                  .slice(0, 12)
                  .map((claim) => ({
                    id: claim.id,
                    verdict: claim.aiVerdict,
                    action: claim.action,
                  })),
                insightPlan: article.insightGate,
                regressionSummary: {
                  previousEditorialScore:
                    finalConvergenceContext.previousEditorialScore,
                  previousEditorialPassed:
                    finalConvergenceContext.previousEditorialPassed,
                  finalComparisonValid:
                    finalConvergenceContext.finalComparisonValid,
                },
                candidateSignal: stripPipelineMarks(article.draft12),
              })
            : finalLegacyContext;
        const lockUserPrompt =
          lockPrompt.promptVersion === "2.0"
            ? buildLockVerifierPromptV2(lockContext)
            : buildPipelinePrompt("finalize-verify", lockContext);
        const finalReview = await chatCompletion(
          [
            { role: "system", content: getSystemPromptLite(article.domain) },
            {
              role: "user",
              content: lockUserPrompt,
            },
          ],
          { maxTokens: finalVerifyMaxTokens, temperature: 0.2, reasoningEffort: "low" },
        );
        const result = inspectFinalVerification(finalReview, article.factCheck);
        const finalVerifyLlmMs = Date.now() - llmStarted;
        const finalGateFailures =
          result.machineContract === "lock-v2"
            ? editorialLockInspection.gateFailures
            : parseEditorialGateFailures(finalReview).map(
                (failure) => failure.code,
              );
        const lockPromptTelemetry = buildPromptExecutionTelemetry({
          descriptor: lockPrompt,
          contextCharacterLength: lockContext.length,
          legacyContextCharacterLength: finalLegacyContext.length,
          lockDecision: result.lockDecision,
          blockingResidualCount:
            result.blockingResiduals.length +
            result.unresolvedDefectIds.length +
            result.openRequiredActions.length,
          falseMinorSuppressed:
            result.machineContract === "lock-v2" &&
            result.publishReady &&
            result.optionalPolishActions.length > 0,
          malformedOutput: !result.machineReadable,
        });
        const lockContextIncomplete =
          result.machineContract === "lock-v2" &&
          result.lockDecision === "CONTEXT_INCOMPLETE";
        if (!result.machineReadable || lockContextIncomplete) {
          const formatAttempts = await prisma.workflowTransition.count({
            where: {
              articleId,
              workflowRunId: article.workflowRunId,
              action: "final-verification-format-invalid",
            },
          });
          const nextAttempt = formatAttempts + 1;
          const exhausted = nextAttempt >= MAX_FINAL_VERIFICATION_FORMAT_RETRIES;
          const reasonHint = lockContextIncomplete
            ? "CONTEXT_INCOMPLETE"
            : result.degenerateScores
              ? "điểm thoái hoá 0/0"
              : result.failureReasons[0] || "sai format";
          const updated = await commitPatch({
            action: "final-verification-format-invalid",
            success: false,
            articlePatch: {
              errorMessage: exhausted
                ? lockContextIncomplete
                  ? `Lock Verifier CONTEXT_INCOMPLETE sau ${MAX_FINAL_VERIFICATION_FORMAT_RETRIES} lần — ` +
                    result.failureReasons.join(" · ")
                  : `Final Verification sai định dạng sau ${MAX_FINAL_VERIFICATION_FORMAT_RETRIES} lần — ` +
                    result.failureReasons.join(" · ")
                : lockContextIncomplete
                  ? `Lock Verifier báo CONTEXT_INCOMPLETE ` +
                    `(${reasonHint}; lần ${nextAttempt}/${MAX_FINAL_VERIFICATION_FORMAT_RETRIES}) — tự chạy lại 9b.`
                  : `Final Verification output chưa đúng machine format ` +
                    `(${reasonHint}; lần ${nextAttempt}/${MAX_FINAL_VERIFICATION_FORMAT_RETRIES}) — tự chạy lại 9b.`,
            },
            details: {
              ...result,
              formatAttempt: nextAttempt,
              telemetry: buildRemediationTelemetry({
                articleId,
                workflowState: article.workflowState,
                transitionName: "final-verification-format-invalid",
                draft: stripPipelineMarks(article.draft12),
                result: exhausted ? "exhausted" : "retry",
                attempt: nextAttempt,
                retryCount: nextAttempt,
                gateFailCount: finalGateFailures.length,
                gateFailures: finalGateFailures,
                failureReasons: result.failureReasons,
                totalScore:
                  result.machineContract === "lock-v2"
                    ? finalConvergenceContext.previousEditorialScore
                    : result.totalScore,
                machineReadable: result.machineReadable,
                machineContract: lockContextIncomplete
                  ? result.machineContract
                  : "invalid",
                decision: result.lockDecision,
                maxTokens: finalVerifyMaxTokens,
                llmMs: finalVerifyLlmMs,
                errorClass: "parser",
                prompt: lockPromptTelemetry,
              }),
            },
            artifact: {
              type: ArtifactType.REVIEW,
              content: finalReview,
              sourceRevision: await latestArtifactRevision(articleId, ArtifactType.FACT_CHECK),
              sourceArtifactType: ArtifactType.FACT_CHECK,
            },
          });
          return withTimings(updated, {
            llmMs: finalVerifyLlmMs,
            finalizePhase: exhausted
              ? "final-verify-format-exhausted"
              : "final-verify-format-retry",
          });
        }
        const finalConvergence = buildConvergenceTelemetry({
          observation: "final",
          currentScore:
            result.machineContract === "lock-v2"
              ? finalConvergenceContext.previousEditorialScore
              : result.totalScore,
          previousEditorialScore:
            finalConvergenceContext.finalComparisonValid
              ? finalConvergenceContext.previousEditorialScore
              : null,
          rewriteCount: finalConvergenceContext.rewriteCount,
        });
        const lockTelemetryScore =
          result.machineContract === "lock-v2"
            ? finalConvergenceContext.previousEditorialScore
            : result.totalScore;
        const finalMinorGuard = evaluateFinalMinorGuard({
          enabled:
            PIPELINE_CONFIG.aiTfesV2.falseFinalMinorGuard.enabled,
          machineReadable: result.machineReadable,
          alreadyPublishReady: result.publishReady,
          finalDecision: result.decision,
          finalReview,
          finalScore: lockTelemetryScore,
          finalInsightScore:
            result.machineContract === "lock-v2"
              ? editorialLockInspection.insightScore
              : result.insightScore,
          finalGatesPassed: result.gatesPassed,
          factPassed: result.factPassed,
          blockingClaims: result.blockingClaims,
          openActions: result.openActions,
          editorialPassed:
            finalConvergenceContext.previousEditorialPassed &&
            finalConvergenceContext.finalComparisonValid,
          editorialScore: finalConvergenceContext.previousEditorialScore,
          editorialGateFailCount:
            finalConvergenceContext.previousEditorialGateFailCount,
          editorialThreshold: TFES_CONTRACT.editorialReview.minimumTotalScore,
          insightFloor: TFES_CONTRACT.finalReview.minimumInsightScore,
        });
        const effectivePublishReady =
          result.publishReady || finalMinorGuard.suppressed;
        const finalMinorGuardTelemetry = {
          finalMinorGuardEligible: finalMinorGuard.eligible,
          finalMinorSuppressed: finalMinorGuard.suppressed,
          finalMinorReasonClass: finalMinorGuard.reasonClass,
          finalScore: lockTelemetryScore,
          editorialScore: finalConvergenceContext.previousEditorialScore,
          factPassed: result.factPassed,
          blockingResidualCount: finalMinorGuard.blockingResidualCount,
          guardEnabled:
            PIPELINE_CONFIG.aiTfesV2.falseFinalMinorGuard.enabled,
        };
        const nextState = effectivePublishReady
          ? WorkflowState.FINAL_REVIEWED
          : result.machineContract === "lock-v2"
            ? result.lockDecision === "REWRITE_ESCALATION_REQUESTED"
              ? WorkflowState.REWRITE_REQUIRED
              : result.lockDecision === "FACT_PATCH_REQUIRED"
                ? WorkflowState.MAJOR_REVISION_REQUIRED
                : WorkflowState.MINOR_REVISION_REQUIRED
          : (result.totalScore ?? 0) < 75 ||
              (result.insightScore ?? 0) < TFES_CONTRACT.finalReview.minimumInsightScore
            ? WorkflowState.REWRITE_REQUIRED
            : (result.totalScore ?? 0) < 85
              ? WorkflowState.MAJOR_REVISION_REQUIRED
              : WorkflowState.MINOR_REVISION_REQUIRED;
        const nextKr = `${article.knowledgeRecord ?? ""}\n\n## Final Verification (pipeline)\n${finalReview}${effectivePublishReady ? `\n\n${FINAL_REVIEW_DONE_MARK}` : ""}`.trim();
        const transitioned = await commitTransition({
          to: nextState,
          action: "final-verification",
          success: effectivePublishReady,
          articlePatch: {
            knowledgeRecord: nextKr,
            errorMessage: effectivePublishReady
              ? null
              : `Final Verification chưa đạt — ${result.failureReasons.join(" · ")}.`,
          },
          details: {
            ...result,
            effectivePublishReady,
            finalMinorGuard: finalMinorGuardTelemetry,
            telemetry: buildRemediationTelemetry({
              articleId,
              workflowState: nextState,
              transitionName: "final-verification",
              draft: stripPipelineMarks(article.draft12),
              result: effectivePublishReady ? "pass" : "fail",
              gateFailCount: finalGateFailures.length,
              gateFailures: finalGateFailures,
              failureReasons: result.failureReasons,
              totalScore: lockTelemetryScore,
              machineReadable: result.machineReadable,
              machineContract: result.machineContract,
              decision: result.lockDecision ?? nextState,
              maxTokens: finalVerifyMaxTokens,
              llmMs: finalVerifyLlmMs,
              errorClass: effectivePublishReady ? null : "content",
              convergence: finalConvergence,
              finalMinorGuard: finalMinorGuardTelemetry,
              prompt: lockPromptTelemetry,
            }),
          },
          artifact: {
            type: ArtifactType.REVIEW,
            content: finalReview,
            sourceRevision: await latestArtifactRevision(articleId, ArtifactType.FACT_CHECK),
            sourceArtifactType: ArtifactType.FACT_CHECK,
          },
        });
        return withTimings(transitioned, {
          llmMs: finalVerifyLlmMs,
          finalizePhase: effectivePublishReady
            ? "final-verify"
            : "final-verify-fail",
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
        details: {
          isTimeout,
          isQuality,
          isCleanPublishFail,
          telemetry: buildRemediationTelemetry({
            articleId,
            workflowState: cursor.state,
            transitionName: "workflow-step-error",
            draft: stripPipelineMarks(article.draft12),
            result: "error",
            failureReasons: [redactSecrets(raw)],
            errorClass: isTimeout ? "timeout" : isQuality ? "content" : "runtime",
          }),
        },
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
 * Minimal exhausted recovery: preserve the run and counters, append a manual draft revision,
 * invalidate downstream outputs, then force Editorial Review from DRAFTED.
 */
export async function saveManualDraftRevision(input: {
  articleId: string;
  draftMarkdown: string;
  actorId: string;
  expectedVersion: number;
}): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: input.articleId },
  });
  assertExpectedWorkflowVersion(article.workflowVersion, input.expectedVersion);

  const [previousDraftRevision, revisionAttempts, factAttempts] = await Promise.all([
    latestArtifactRevision(input.articleId, ArtifactType.ARTICLE_DRAFT),
    prisma.workflowTransition.count({
      where: {
        articleId: input.articleId,
        workflowRunId: article.workflowRunId,
        action: "remediate-required-revision",
      },
    }),
    prisma.workflowTransition.count({
      where: {
        articleId: input.articleId,
        workflowRunId: article.workflowRunId,
        action: "remediate-fact-check",
      },
    }),
  ]);
  const prepared = prepareManualDraftRecovery({
    draftMarkdown: input.draftMarkdown,
    currentDraft: article.draft12,
    knowledgeRecord: article.knowledgeRecord,
    factCheck: article.factCheck,
    errorMessage: article.errorMessage,
    revisionAttempts,
    factAttempts,
  });

  return transitionArticle({
    articleId: input.articleId,
    expectedState: article.workflowState,
    expectedVersion: input.expectedVersion,
    to: WorkflowState.DRAFTED,
    action: "manual-draft-revision",
    actorId: input.actorId,
    articlePatch: prepared.articlePatch,
    details: {
      ...prepared.details,
      previousDraftRevision,
      telemetry: buildRemediationTelemetry({
        articleId: input.articleId,
        workflowState: WorkflowState.DRAFTED,
        transitionName: "manual-draft-revision",
        draft: prepared.nextDraft,
        result: "retry",
        remediationCount: 0,
        lifetimeRemediationCount: prepared.details.remediationCount,
        cycleRemediationCount: 0,
        errorClass: "content",
      }),
    },
    artifact: {
      type: ArtifactType.ARTICLE_DRAFT,
      content: prepared.nextDraft,
      sourceRevision: previousDraftRevision,
      sourceArtifactType: ArtifactType.ARTICLE_DRAFT,
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

  // Cấm «Giữ nguyên» hết khi AI đã yêu cầu revision — tránh lọt Fact/9b với draft chưa sửa.
  if (aiRequestedRevision && !requestedAiFix) {
    throw new Error(
      "AI yêu cầu Minor/Major/Rewrite — không được «Giữ nguyên» hết. " +
        "Chọn «Nhờ AI sửa tiếp» cho ít nhất một điểm Fail/Required Revisions.",
    );
  }

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
      acceptedWithoutRevision: false,
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

/** Article-scoped WP2.7 feedback; metadata only, so it does not create a workflow transition. */
export async function saveEditorValidationFeedback(input: {
  articleId: string;
  actorId: string;
  expectedVersion: number;
  finalUsability: number;
  manualEditEffort: number;
  confusingStep: string;
  errorHelpfulness: number;
  reuseIntent: number;
  note?: string;
}): Promise<Article> {
  const article = await prisma.article.findUniqueOrThrow({
    where: { id: input.articleId },
  });
  const completed = new Set<WorkflowState>([
    WorkflowState.PUBLISH_READY,
    WorkflowState.APPROVED,
    WorkflowState.PUBLISHED,
  ]).has(article.workflowState);
  const exhausted =
    isRevisionRemediationExhausted(article.errorMessage) ||
    isFactRemediationExhausted(article.errorMessage);
  if (!completed && !exhausted) {
    throw new Error("Chỉ thu feedback khi bài đã hoàn thành hoặc remediation exhausted");
  }

  const { buildEditorValidationFeedback, mergeDeskJson } = await import(
    "@/lib/tfes/desk-state"
  );
  const validationFeedback = buildEditorValidationFeedback({
    ...input,
    userId: input.actorId,
  });
  const updated = await prisma.article.updateMany({
    where: {
      id: input.articleId,
      workflowVersion: input.expectedVersion,
    },
    data: {
      deskJson: mergeDeskJson(article.deskJson, { validationFeedback }),
    },
  });
  if (updated.count !== 1) {
    throw new Error("Workflow conflict: bài đã thay đổi trước khi lưu feedback");
  }
  return prisma.article.findUniqueOrThrow({ where: { id: input.articleId } });
}
