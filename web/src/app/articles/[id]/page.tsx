"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { ApproveGate } from "@/components/approve-gate";
import { HumanReviewGate } from "@/components/human-review-gate";
import { ArticleImageStudio } from "@/components/article-image-studio";
import { CleanEditPanel } from "@/components/clean-edit-panel";
import { ManualDraftRecoveryPanel } from "@/components/manual-draft-recovery-panel";
import { RemediationTimeline } from "@/components/remediation-timeline";
import { FactLedgerPanel } from "@/components/fact-ledger-panel";
import { EditorialSummaryPanel } from "@/components/editorial-summary-panel";
import { EditorValidationFeedback } from "@/components/editor-validation-feedback";
import { MarkdownView } from "@/components/markdown-view";
import { PipelineRunPanel, type PipelineLogLine } from "@/components/pipeline-run-panel";
import { PipelineSteps } from "@/components/pipeline-steps";
import { DomainBadge, StatusBadge, STEP_LABELS } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { resolvePublishFormat, resolveShapeForArticle } from "@/lib/tfes/publish-formats";
import { prepareReaderContent } from "@/lib/publish-content";
import { isAwaitingHumanReview } from "@/lib/tfes/human-review";
import { isFactRemediationExhausted } from "@/lib/tfes/fact-ledger";
import {
  isFinalVerificationFormatExhausted,
  isRevisionRemediationExhausted,
  MAX_FINAL_VERIFICATION_SOFT_RETRIES,
} from "@/lib/tfes/retry-policy";
import { stripPipelineMarks } from "@/lib/tfes/parser";
import {
  isCleanBodyQualityFail,
  isCleanPublishQualityFail,
  isWritePhaseQualityFail,
} from "@/lib/tfes/quality";
import { resolveMicroStepLabel } from "@/lib/tfes/tracker";
import {
  type ArticleTabKey,
  resolveArticleTabKey,
  tabForFinalVerificationFailure,
} from "@/lib/article-tabs";

type Article = {
  id: string;
  title: string | null;
  topic: string | null;
  domain: string;
  status: string;
  workflowState: string;
  workflowRunId: string;
  workflowVersion: number;
  contentVersion: string;
  currentStep: string | null;
  errorMessage: string | null;
  publishFormat?: string | null;
  articleShapeId?: string | null;
  articleShapeVersion?: string | null;
  articleShapeSnapshot?: string | null;
  seriesId?: string | null;
  seriesOrder?: number | null;
  targetWordCount?: number | null;
  avoidFormats?: string | null;
  researchBrief: string | null;
  insightGate: string | null;
  draft12: string | null;
  factCheck: string | null;
  knowledgeRecord: string | null;
  cleanPublish: string | null;
  heroBrief: string | null;
  heroImageUrl: string | null;
  heroImageModel: string | null;
  heroImageAlt: string | null;
  heroPromptUsed: string | null;
  galleryJson?: string | null;
  deskJson?: string | null;
  reviewerNotes: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
};

const TABS = [
  { key: "clean", label: "Bản sạch", desc: "Bài đọc liền để đăng" },
  { key: "research", label: "Nghiên cứu", desc: "Nguồn & trade-off" },
  { key: "insight", label: "Cổng Insight", desc: "Gate → Decision → Planning" },
  { key: "draft", label: "Bản nháp 12 phần", desc: "Bản làm việc" },
  { key: "fact", label: "Fact-check", desc: "Bước 9 · Claim → nguồn" },
  { key: "knowledge", label: "Review / Knowledge", desc: "Review · Reader Sim · metadata" },
  { key: "desk", label: "Tóm biên tập", desc: "AI góp ý · người chốt · duyệt" },
] as const satisfies ReadonlyArray<{ key: ArticleTabKey; label: string; desc: string }>;

function timeoutMessage(status: number): string {
  if (status === 504 || status === 408) {
    return "Timeout — hệ thống sẽ tự chạy lại bước (chu trình tách nhỏ từng bước).";
  }
  return `HTTP ${status}`;
}

function isTimeoutLike(message: string, status?: number): boolean {
  if (status === 504 || status === 408) return true;
  return /timed? ?out|timeout|Hobby chỉ cho|Request timed out/i.test(message);
}

type CallActionResult = {
  article: Article | null;
  /** Tiếp tục vòng lặp full-pipeline (timeout / gate soft) */
  softContinue?: boolean;
};

const TERMINAL_WORKFLOW_STATES = new Set([
  "PUBLISH_READY",
  "APPROVED",
  "PUBLISHED",
  "CORRECTION_REQUIRED",
  "RETRACTED",
]);
const BLOCKING_WORKFLOW_STATES = new Set([
  "INSIGHT_REJECTED",
]);

function isWorkflowStopped(article: Article): boolean {
  if (TERMINAL_WORKFLOW_STATES.has(article.workflowState)) return true;
  if (BLOCKING_WORKFLOW_STATES.has(article.workflowState)) return true;
  if (isRevisionRemediationExhausted(article.errorMessage)) return true;
  if (isFinalVerificationFormatExhausted(article.errorMessage)) return true;
  if (
    article.workflowState === "FACT_CHECK_FAILED" &&
    isFactRemediationExhausted(article.errorMessage)
  ) return true;
  return article.workflowState === "READER_SIMULATION_FAILED" &&
    /chưa đạt sau/i.test(article.errorMessage ?? "");
}

function tabForArticle(a: Article): ArticleTabKey {
  const clean = (a.cleanPublish ?? "").trim();
  const draft = stripPipelineMarks(a.draft12);
  if (isAwaitingHumanReview(a)) return "knowledge";
  if (clean.length >= 80) return "clean";
  if (draft.length >= 40) return "draft";
  if (a.factCheck) return "fact";
  if (a.insightGate) return "insight";
  if (a.researchBrief) return "research";
  return "research";
}

function LoadingSkeleton() {
  return (
    <AppShell title="Đang tải..." subtitle="Lấy dữ liệu bài viết" backHref="/dashboard">
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />
        <div className="h-64 animate-pulse rounded-2xl bg-[var(--surface-muted)]" />
      </div>
    </AppShell>
  );
}

let logSeq = 0;

export default function ArticleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [id, setId] = useState<string>("");
  const [article, setArticle] = useState<Article | null>(null);
  const [tab, setTabRaw] = useState<ArticleTabKey>("clean");
  const setTab = useCallback((key: string) => {
    setTabRaw(resolveArticleTabKey(key));
  }, []);
  const [running, setRunning] = useState(false);
  const [runningLabel, setRunningLabel] = useState("");
  const [logs, setLogs] = useState<PipelineLogLine[]>([]);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "err">("idle");
  const finalVerifySoftRef = useRef(0);

  useEffect(() => {
    params.then((p) => setId(p.id));
  }, [params]);

  const pushLog = useCallback((level: PipelineLogLine["level"], text: string) => {
    logSeq += 1;
    setLogs((prev) => [
      ...prev,
      { id: `${Date.now()}-${logSeq}`, level, text, at: Date.now() },
    ]);
  }, []);

  const load = useCallback(async () => {
    if (!id) return null;
    const res = await fetch(`/api/articles/${id}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { article: Article };
    setArticle(data.article);
    return data.article;
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function callAction(
    action:
      | "run-step"
      | "reset"
      | "approve"
      | "publish"
      | "confirm-human-review"
      | "request-correction"
      | "apply-correction"
      | "retract",
    opts?: {
      allowWithoutHero?: boolean;
      editorialScore?: number;
      checklist?: string[];
      reviewFindingsAck?: string[];
      goldBarOverride?: boolean;
      items?: { id: string; disposition: "fixed" | "accept"; note?: string }[];
      notes?: string;
      correction?: string;
      meaningChanged?: boolean;
    },
  ): Promise<CallActionResult> {
    if (!id) return { article: null };

    const stepBefore = article?.currentStep ?? "RESEARCH";
    if (action === "run-step") {
      const micro = article ? resolveMicroStepLabel(article) : STEP_LABELS[stepBefore];
      setRunningLabel(`Đang chạy: ${micro}`);
      pushLog("info", `→ Bắt đầu ${micro}...`);
    } else if (action === "confirm-human-review") {
      setRunningLabel("Đang lưu xác nhận Review...");
      pushLog("info", "→ Người xác nhận Review AI...");
    } else {
      setRunningLabel(
        action === "reset"
          ? "Đang làm lại từ đầu..."
          : action === "approve"
            ? "Đang duyệt..."
            : "Đang đăng...",
      );
      pushLog("info", `→ ${action}...`);
    }

    setRunning(true);
    setActionError("");

    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(`/api/articles/${id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          notes: opts?.notes ?? notes ?? undefined,
          allowWithoutHero: opts?.allowWithoutHero || undefined,
          editorialScore: opts?.editorialScore,
          checklist: opts?.checklist,
          reviewFindingsAck: opts?.reviewFindingsAck,
          goldBarOverride: opts?.goldBarOverride || undefined,
          items: opts?.items,
          correction: opts?.correction,
          meaningChanged: opts?.meaningChanged,
        }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Mất kết nối tới server";
      setRunning(false);
      setRunningLabel("");
      setActionError(msg);
      pushLog("error", `✗ Không gọi được API: ${msg}`);
      // Mạng đứt tạm — full pipeline có thể thử lại
      if (action === "run-step" && /fetch|network|Failed to fetch|aborted/i.test(msg)) {
        const refreshed = await load();
        if (refreshed && !isWorkflowStopped(refreshed)) {
          pushLog("warn", "⚠ Mất kết nối tạm — sẽ tự thử lại bước...");
          return { article: refreshed, softContinue: true };
        }
      }
      return { article: null };
    }

    let data: {
      article?: Article;
      error?: string;
      timings?: {
        searchMs?: number;
        llmMs?: number;
        searchHits?: number;
        searchQueries?: number;
        researchPhase?: string;
        insightPhase?: string;
        writePhase?: string;
        finalizePhase?: string;
      };
    } = {};
    try {
      data = (await res.json()) as typeof data;
    } catch {
      /* Vercel 504 thường trả HTML */
    }
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    setRunning(false);
    setRunningLabel("");

    if (!res.ok) {
      const msg = data.error ?? timeoutMessage(res.status);
      setActionError(msg);
      pushLog("error", `✗ ${msg} (${elapsedSec}s)`);
      const refreshed = await load();
      const softQuality =
        isCleanPublishQualityFail(msg) ||
        isWritePhaseQualityFail(msg) ||
        /bịa|công ty giả|≥3 nguồn/i.test(msg);
      if (
        action === "run-step" &&
        refreshed &&
        !isWorkflowStopped(refreshed) &&
        (isTimeoutLike(msg, res.status) || softQuality)
      ) {
        const isCleanOnly = isCleanBodyQualityFail(msg);
        const isListicle = /listicle|outline listicle/i.test(msg);
        pushLog(
          "warn",
          isCleanOnly
            ? "⚠ Bản sạch chưa đạt — giữ bản lỗi, lần sau sửa (polish/repair), không viết lại từ nháp..."
            : isListicle
              ? "⚠ Listicle — viết lại từ bước Viết..."
              : isTimeoutLike(msg, res.status)
                ? "⚠ Timeout — giữ tiến độ, tự chạy lại bước hiện tại..."
                : "⚠ Chất lượng chưa đạt — tự chạy lại bước hiện tại...",
        );
        return { article: refreshed, softContinue: true };
      }
      return { article: null };
    }

    if (!data.article) {
      pushLog("error", "✗ API không trả về article");
      return { article: null };
    }

    const next = data.article;
    setArticle(next);

    if (BLOCKING_WORKFLOW_STATES.has(next.workflowState)) {
      const msg = next.errorMessage || "Chu trình lỗi";
      setActionError(msg);
      pushLog("error", `✗ Lỗi · ${msg} (${elapsedSec}s)`);
      if (next.currentStep === "INSIGHT" || /Insight|Cổng Insight|Gate/i.test(msg)) {
        setTab("insight");
        pushLog(
          "warn",
          "→ Gate vẫn < L2 sau khi nghiên cứu lại. Đổi chủ đề hoặc Làm lại từ đầu.",
        );
      } else {
        setTab(tabForArticle(next));
      }
      return { article: next };
    }

    const isGateRetry =
      Boolean(next.errorMessage) && /Gate < L2|nghiên cứu lại/i.test(next.errorMessage || "");

    if (isGateRetry && action === "run-step") {
      setActionError(next.errorMessage || "");
      pushLog("warn", `⚠ ${next.errorMessage} (${elapsedSec}s)`);
      pushLog("info", "→ Quay bước Research (Tavily + Verify/Synth) với góc sắc hơn");
      setTab("research");
      return { article: next, softContinue: true };
    }

    if (next.workflowState === "RESEARCH_REQUIRED" && action === "run-step") {
      setActionError(next.errorMessage || "Research chưa đạt contract");
      setTab("research");
      pushLog("warn", "→ Evidence/Decision chưa đạt — tự chạy lại Research với source set mới...");
      return { article: next, softContinue: true };
    }

    if (
      next.workflowState === "FACT_CHECKED" &&
      action === "run-step" &&
      /Final Verification output chưa đúng machine format/i.test(next.errorMessage ?? "") &&
      !isFinalVerificationFormatExhausted(next.errorMessage)
    ) {
      setActionError(next.errorMessage || "Final Verification sai định dạng");
      pushLog(
        "warn",
        /điểm thoái hoá|0\/0/i.test(next.errorMessage ?? "")
          ? "→ 9b chấm 0/0 (không hợp lệ) — tự chấm lại Khóa Review, giữ nguyên Fact-check..."
          : "→ 9b trả sai format — tự chạy lại Khóa Review, không sửa lại bài...",
      );
      return { article: next, softContinue: true };
    }

    if (
      next.workflowState === "FACT_CHECK_FAILED" &&
      action === "run-step" &&
      !isFactRemediationExhausted(next.errorMessage)
    ) {
      setActionError(next.errorMessage || "Fact Check chưa đạt");
      setTab("fact");
      pushLog(
        "warn",
        "→ Tự sửa claim theo ledger, tạo draft revision mới rồi Fact Check lại...",
      );
      return { article: next, softContinue: true };
    }

    if (
      action === "run-step" &&
      ["MINOR_REVISION_REQUIRED", "MAJOR_REVISION_REQUIRED", "REWRITE_REQUIRED"].includes(
        next.workflowState,
      ) &&
      !isAwaitingHumanReview(next) &&
      !isRevisionRemediationExhausted(next.errorMessage)
    ) {
      setActionError(next.errorMessage || "Bài cần revision");
      // Pre-9b GOLD_BAR: dừng để sửa draft trước khi gọi 9b.
      // 9b score fail: soft-continue (tự remediate) — tránh anh phải bấm tay mỗi lần.
      if (/Pre-9b:/i.test(next.errorMessage ?? "")) {
        setTab("draft");
        pushLog(
          "warn",
          "⏸ Pre-9b: draft chưa đạt chuẩn vàng — dừng để sửa trước Khóa Review. Bấm «Chạy bước tiếp» nếu muốn hệ thống tự sửa.",
        );
        return { article: next };
      }
      if (/Final Verification chưa đạt/i.test(next.errorMessage ?? "")) {
        setTab(tabForFinalVerificationFailure());
        finalVerifySoftRef.current += 1;
        const nextCount = finalVerifySoftRef.current;
        if (nextCount > MAX_FINAL_VERIFICATION_SOFT_RETRIES) {
          finalVerifySoftRef.current = 0; // lần bấm tay sau được thêm lượt
          pushLog(
            "warn",
            `⏸ Khóa Review (9b) vẫn chưa đạt sau ${MAX_FINAL_VERIFICATION_SOFT_RETRIES} lần tự sửa — dừng để anh xem Required Revisions. Bấm «Chạy bước tiếp» để thử thêm.`,
          );
          return { article: next };
        }
        pushLog(
          "warn",
          `→ Khóa Review (9b) chưa đạt (${nextCount}/${MAX_FINAL_VERIFICATION_SOFT_RETRIES}) — tự sửa draft + re-review rồi Fact-check lại...`,
        );
        return { article: next, softContinue: true };
      }
      pushLog("warn", "→ Tự sửa draft theo Required Revisions rồi chạy lại Review/Fact Check...");
      return { article: next, softContinue: true };
    }

    if (next.errorMessage && action === "run-step") {
      setActionError(next.errorMessage);
      pushLog("warn", `⚠ ${next.errorMessage} (${elapsedSec}s)`);
      setTab(tabForArticle(next));
      // Self-check / quality: giữ DRAFT — full pipeline thử lại cùng bước
      if (
        !isWorkflowStopped(next) &&
        (isCleanPublishQualityFail(next.errorMessage) ||
          isWritePhaseQualityFail(next.errorMessage))
      ) {
        pushLog(
          "warn",
          /GOLD_BAR:/i.test(next.errorMessage ?? "")
            ? "⚠ Chuẩn vàng Engineering chưa đạt — tự sửa/chạy lại bước hiện tại..."
            : "⚠ Chất lượng chưa đạt — tự chạy lại bước hiện tại...",
        );
        return { article: next, softContinue: true };
      }
      return { article: next };
    }

    if (
      next.workflowState === "READER_SIMULATION_FAILED" &&
      !/chưa đạt sau/i.test(next.errorMessage ?? "")
    ) {
      pushLog("warn", "⚠ Reader Simulation chưa đạt — tự chuyển về Polish để sửa...");
      return { article: next, softContinue: true };
    }

    if (action === "run-step") {
      const phase = data.timings?.researchPhase;
      const insightPhase = data.timings?.insightPhase;
      const writePhase = data.timings?.writePhase;
      const finalizePhase = data.timings?.finalizePhase;
      const finished =
        phase === "search"
          ? "1–2 · Memory + Research (Tavily)"
          : phase === "llm"
            ? "3–4 · Verification + Synthesis"
            : insightPhase === "gate-retry"
              ? "Gate < L2 → Research lại"
              : insightPhase === "gate" || insightPhase === "gate-fail"
                ? "Gate · Insight L2"
                : insightPhase === "decision"
                  ? "5 · Editorial Decision"
                  : insightPhase === "planning"
                    ? "6 · Planning"
                    : writePhase === "a"
                      ? "7 · Writing nửa đầu"
                      : writePhase === "b"
                        ? "7 · Writing nửa sau"
                        : finalizePhase === "review"
                          ? "8 · Review AI"
                          : finalizePhase === "await-human"
                            ? "8 · Chờ người xác nhận Review"
                            : finalizePhase === "revision-remediate"
                              ? "8–9b · Sửa draft theo Review"
                            : finalizePhase === "fact-remediate"
                              ? "9 · Sửa claim theo Fact Check"
                              : finalizePhase === "final-verify"
                                ? "9b · Khóa Review"
                              : finalizePhase === "final-verify-fail"
                                ? "9b · Khóa Review (cần revision)"
                              : finalizePhase === "final-verify-format-retry"
                                ? "9b · Khóa Review (retry format)"
                              : finalizePhase === "fact" || finalizePhase === "a"
                                ? "9 · Fact Check"
                              : finalizePhase === "publish" || finalizePhase === "b"
                                ? next.workflowState === "PUBLISH_READY"
                                  ? "10 · Publish Ready"
                                  : "10 · Bản sạch (chờ polish)"
                                : finalizePhase === "polish"
                                  ? "10b · Polish bản sạch"
                                  : finalizePhase === "reader-sim" ||
                                      finalizePhase === "await-reader-sim"
                                    ? "10c · Reader Simulation"
                                    : finalizePhase === "reader-sim-fail"
                                      ? "10c · Reader Sim (chưa đạt)"
                                      : finalizePhase === "reader-sim-soft"
                                        ? "10c · Reader Sim (xem Knowledge)"
                                        : finalizePhase === "self-check-fail"
                                          ? "10 · Self-check"
                                          : STEP_LABELS[stepBefore] || stepBefore;
      if (phase === "search" && data.timings) {
        const s = Math.round((data.timings.searchMs || 0) / 1000);
        pushLog(
          "info",
          `·· Tavily ${data.timings.searchQueries ?? "?"} query · ${data.timings.searchHits ?? "?"} hits · ${s}s (bước tiếp: Verify + Synth)`,
        );
      } else if (phase === "llm" && data.timings) {
        const l = Math.round((data.timings.llmMs || 0) / 1000);
        pushLog("info", `·· Verification + Synthesis → Research Brief · ${l}s`);
      } else if (data.timings?.llmMs != null) {
        pushLog("info", `·· NVIDIA · ${Math.round((data.timings.llmMs || 0) / 1000)}s`);
      }
      if (next.workflowState === "PUBLISH_READY") {
        pushLog("success", `✓ Xong ${finished} → Chờ duyệt (PUBLISH_READY) · ${elapsedSec}s`);
      } else if (finalizePhase === "review" || isAwaitingHumanReview(next)) {
        pushLog(
          "warn",
          `✓ Xong Review AI · chờ người xác nhận Fail/Minor trước Fact-check · ${elapsedSec}s`,
        );
      } else if (finalizePhase === "await-human") {
        pushLog("warn", `⏸ Đang chờ người xác nhận Review · ${elapsedSec}s`);
      } else if (
        phase === "search" ||
        insightPhase === "gate" ||
        insightPhase === "decision" ||
        writePhase === "a" ||
        finalizePhase === "fact" ||
        finalizePhase === "fact-remediate" ||
        finalizePhase === "revision-remediate" ||
        finalizePhase === "a" ||
        finalizePhase === "publish" ||
        finalizePhase === "polish" ||
        finalizePhase === "await-reader-sim"
      ) {
        pushLog("success", `✓ Xong ${finished} · còn phase tiếp · ${elapsedSec}s`);
      } else {
        pushLog(
          "success",
          `✓ Xong ${finished} · bước tới: ${next.currentStep ? STEP_LABELS[next.currentStep] : "—"} · ${elapsedSec}s`,
        );
      }
      setTab(tabForArticle(next));
    } else if (action === "reset") {
      pushLog("warn", `✓ Đã làm lại từ đầu (${elapsedSec}s)`);
      setActionError("");
    } else if (action === "confirm-human-review") {
      const needsRevision = [
        "MINOR_REVISION_REQUIRED",
        "MAJOR_REVISION_REQUIRED",
        "REWRITE_REQUIRED",
      ].includes(next.workflowState);
      pushLog(
        "success",
        needsRevision
          ? `✓ Đã xác nhận Review người · sửa các điểm đã chọn (${elapsedSec}s)`
          : `✓ Đã xác nhận Review người · tiếp Fact-check (${elapsedSec}s)`,
      );
      setTab(tabForArticle(next));
    } else {
      pushLog("success", `✓ ${action} → ${next.status} (${elapsedSec}s)`);
    }

    return { article: next };
  }

  async function runFullPipeline() {
    if (!article || !id) return;
    setActionError("");
    finalVerifySoftRef.current = 0;
    pushLog("info", "→ Chạy cả chu trình AI-TFES (10 bước + Gate) — timeout sẽ tự retry...");

    let safety = 0;
    let softRetries = 0;
    let publishSoftRetries = 0;
    let current = article;
    const MAX_STEPS = 40;
    const MAX_SOFT_RETRIES = 16;
    const MAX_PUBLISH_SOFT = 4;

    while (
      safety < MAX_STEPS &&
      !isWorkflowStopped(current)
    ) {
      if (isAwaitingHumanReview(current)) {
        pushLog(
          "warn",
          "⏸ Dừng chu trình — xác nhận Review (người) ở panel bên dưới rồi bấm tiếp",
        );
        setTab("knowledge");
        break;
      }
      safety += 1;
      const result = await callAction("run-step");
      if (!result.article) {
        pushLog("error", "✗ Dừng chu trình vì lỗi mạng/API — bấm lại để tiếp tục");
        break;
      }
      current = result.article;

      if (isAwaitingHumanReview(current)) {
        pushLog(
          "warn",
          "⏸ Review AI xong — xác nhận Fail/Minor rồi hệ thống mới Fact-check",
        );
        setTab("knowledge");
        break;
      }

      if (result.softContinue) {
        softRetries += 1;
        const err = current.errorMessage || actionError || "";
        if (isCleanBodyQualityFail(err)) {
          publishSoftRetries += 1;
          if (publishSoftRetries > MAX_PUBLISH_SOFT) {
            pushLog(
              "error",
              `✗ Publish Ready fail ${MAX_PUBLISH_SOFT} lần — dừng. Giữ tab Bản sạch / bấm “Chạy bước tiếp” sau khi deploy bản mới.`,
            );
            break;
          }
        }
        if (softRetries > MAX_SOFT_RETRIES) {
          pushLog(
            "error",
            `✗ Đã tự retry ${MAX_SOFT_RETRIES} lần (timeout/chất lượng) — dừng để anh kiểm tra log`,
          );
          break;
        }
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      if (isWorkflowStopped(current)) break;
      if (current.errorMessage) break;
    }

    if (current.workflowState === "PUBLISH_READY") {
      pushLog("success", "✓ Chu trình xong — xem Bản sạch / Bản nháp 12 phần");
      finalVerifySoftRef.current = 0;
    } else if (BLOCKING_WORKFLOW_STATES.has(current.workflowState)) {
      pushLog(
        "error",
        current.currentStep === "INSIGHT" ||
          /Insight|Cổng Insight|Gate|Self-check/i.test(current.errorMessage || "")
          ? "✗ Dừng ở cổng chất lượng (Gate/Self-check). Xem log · đổi góc hoặc Làm lại từ đầu."
          : "✗ Chu trình dừng vì lỗi",
      );
    } else if (
      current.errorMessage &&
      /Gate < L2|nghiên cứu lại/i.test(current.errorMessage)
    ) {
      pushLog("warn", `⚠ ${current.errorMessage} — bấm tiếp để Research lại`);
    } else if (softRetries > 0 && !isWorkflowStopped(current)) {
      pushLog(
        "warn",
        `⚠ Dừng giữa chừng sau ${softRetries} lần soft-retry — bấm “Cả chu trình” để tiếp tục`,
      );
    }
  }

  function buildExportMarkdown(): string {
    if (!article?.cleanPublish) return "";
    // Bản sạch đã có ảnh gallery (file URL); data URL không nằm trong markdown
    return prepareReaderContent(stripPipelineMarks(article.cleanPublish), {
      stripLeadingHeroImage: false,
      stripHeroBriefSection: true,
    }).trim();
  }

  async function copyCleanMarkdown() {
    const md = buildExportMarkdown();
    if (!md) return;
    try {
      await navigator.clipboard.writeText(md);
      setCopyState("ok");
      pushLog("success", "✓ Đã copy Markdown bản sạch");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("err");
      pushLog("error", "✗ Không copy được — thử Tải .md");
      window.setTimeout(() => setCopyState("idle"), 2500);
    }
  }

  function downloadCleanMarkdown() {
    const md = buildExportMarkdown();
    if (!md || !article) return;
    const slug =
      (article.title || article.topic || "bai-viet")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 60) || "bai-viet";
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
    pushLog("success", `✓ Đã tải ${slug}.md`);
  }

  if (!article) return <LoadingSkeleton />;

  const contentMap: Record<string, string | null> = {
    clean: article.cleanPublish
      ? prepareReaderContent(stripPipelineMarks(article.cleanPublish), {
          stripLeadingHeroImage: Boolean(article.heroImageUrl),
          stripHeroBriefSection: true,
        })
      : null,
    research: article.researchBrief?.includes("<!--TFES_SEARCH_BLOB-->")
      ? "Đã có kết quả Tavily (blob). Chạy bước Research lần 2 để GLM/Llama viết Research Brief."
      : article.researchBrief,
    insight: article.insightGate,
    draft: article.draft12
      ? prepareReaderContent(stripPipelineMarks(article.draft12), {
          stripLeadingHeroImage: true,
          stripHeroBriefSection: true,
        })
      : null,
    fact: article.factCheck,
    knowledge: article.knowledgeRecord
      ? stripPipelineMarks(article.knowledgeRecord)
      : null,
    desk: article.knowledgeRecord || article.factCheck || article.reviewerNotes || "ready",
  };

  const activeTab = TABS.find((t) => t.key === tab);
  const activeContent = contentMap[tab];
  const displayError = actionError || article.errorMessage;
  const microLabel = resolveMicroStepLabel(article);
  const awaitingHuman = isAwaitingHumanReview(article);
  const isReviewMode =
    article.workflowState === "PUBLISH_READY" || article.workflowState === "APPROVED";

  return (
    <AppShell
      title={article.title || article.topic || "Bài mới"}
      subtitle={
        running
          ? runningLabel
          : isReviewMode
            ? "Chế độ duyệt — kiểm Bản sạch + Fact rồi Approve"
            : awaitingHuman
              ? "Chờ người xác nhận Review AI trước Fact-check"
              : `Bước tiếp: ${microLabel}`
      }
      backHref="/dashboard"
      backLabel="Biên tập"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={article.status} />
          <DomainBadge domain={article.domain} />
          {article.workflowState === "PUBLISHED" && (
            <Link
              href={`/library/${article.id}`}
              className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)]"
            >
              Xem trong Thư viện →
            </Link>
          )}
        </div>
      }
    >
      <section className="mb-5">
        <PipelineSteps article={article} running={running} />
        <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
          {(() => {
            const fmt = resolvePublishFormat(article.publishFormat);
            const shape = resolveShapeForArticle({
              articleId: article.id,
              publishFormat: article.publishFormat,
              articleShapeId: article.articleShapeId,
              articleShapeSnapshot: article.articleShapeSnapshot,
            });
            return (
              <>
                <span className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 font-medium text-[var(--accent)]">
                  {fmt.labelVi}
                </span>
                <span
                  className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 font-medium text-[var(--ink-muted)]"
                  title={`ARTICLE_SHAPE: ${shape.id} — ${shape.fit}`}
                >
                  Khung: {shape.labelVi}{article.articleShapeVersion ? ` · v${article.articleShapeVersion}` : ""}
                </span>
              </>
            );
          })()}
          {article.seriesId && (
            <Link
              href={`/series/${article.seriesId}`}
              className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 font-medium text-[var(--ink-muted)] hover:text-[var(--accent)]"
            >
              Series{article.seriesOrder != null ? ` #${article.seriesOrder}` : ""}
            </Link>
          )}
          {article.targetWordCount ? (
            <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 font-medium text-[var(--ink-muted)]">
              ~{article.targetWordCount} từ (bản sạch)
            </span>
          ) : null}
          <span
            className="rounded-full bg-[#eef2ff] px-2.5 py-1 font-semibold text-[#4338ca]"
            title={`Workflow run: ${article.workflowRunId}`}
          >
            v1.6 · {article.workflowState}
          </span>
          <span className="rounded-full bg-[var(--surface-muted)] px-2.5 py-1 font-semibold text-[var(--ink-muted)]">
            Content {article.contentVersion}
          </span>
          {(article.avoidFormats || "").trim() ? (
            <span
              className="rounded-full bg-[var(--accent-soft)] px-2.5 py-1 font-medium text-[var(--accent)]"
              title={article.avoidFormats || undefined}
            >
              tránh: {(article.avoidFormats || "").length > 48
                ? `${(article.avoidFormats || "").slice(0, 48)}…`
                : article.avoidFormats}
            </span>
          ) : null}
        </div>
      </section>

      <PipelineRunPanel
        running={running}
        runningLabel={runningLabel}
        status={article.status}
        currentStepLabel={microLabel}
        errorMessage={displayError}
        logs={logs}
        onClear={() => setLogs([])}
        defaultExpanded={false}
      />

      <section className="mb-6 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          busy={running}
          disabled={running || TERMINAL_WORKFLOW_STATES.has(article.workflowState) || isReviewMode || awaitingHuman}
          onClick={() => callAction("run-step")}
        >
          {running ? "Đang chạy..." : "Chạy bước tiếp"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          busy={running}
          disabled={running || TERMINAL_WORKFLOW_STATES.has(article.workflowState) || isReviewMode || awaitingHuman}
          onClick={runFullPipeline}
          title="Timeout/self-check sẽ tự retry đến PUBLISH_READY (giữ tab mở)"
        >
          Chạy cả chu trình
        </Button>
        <Button
          variant="ghost"
          size="sm"
          busy={running}
          disabled={running}
          onClick={() => callAction("reset")}
        >
          Làm lại từ đầu
        </Button>
        {article.workflowState !== "PUBLISHED" && article.workflowState !== "RETRACTED" && (
          <Button
            variant="danger"
            size="sm"
            disabled={running}
            onClick={async () => {
              const label = article.title || article.topic || "bài này";
              if (!window.confirm(`Xoá bài “${label}”? Không hoàn tác được.`)) return;
              setRunning(true);
              setRunningLabel("Đang xoá bài...");
              const res = await fetch(`/api/articles/${id}`, { method: "DELETE" });
              setRunning(false);
              setRunningLabel("");
              if (!res.ok) {
                const data = (await res.json().catch(() => ({}))) as { error?: string };
                pushLog("error", `✗ ${data.error ?? "Không xoá được"}`);
                return;
              }
              router.push("/dashboard");
              router.refresh();
            }}
          >
            Xoá bài
          </Button>
        )}
        {article.workflowState === "PUBLISHED" && (
          <Button
            variant="secondary"
            size="sm"
            disabled={running}
            onClick={() => {
              const report = window.prompt("Mô tả bằng chứng mới hoặc lỗi cần correction audit:");
              if (report?.trim()) void callAction("request-correction", { correction: report });
            }}
          >
            Mở correction audit
          </Button>
        )}
        {article.workflowState === "CORRECTION_REQUIRED" && (
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={running}
              onClick={() => {
                const correction = window.prompt(
                  "Dán TOÀN BỘ bản Markdown đã correction (bắt đầu bằng # Title):",
                );
                if (!correction?.trim()) return;
                const meaningChanged = window.confirm(
                  "Correction này có thay đổi meaning/claim không? OK = có, phải chạy lại Fact Check + Final Verification.",
                );
                void callAction("apply-correction", { correction, meaningChanged });
              }}
            >
              Ghi correction
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={running}
              onClick={() => {
                const reason = window.prompt("Lý do retract bài:");
                if (reason?.trim()) void callAction("retract", { correction: reason });
              }}
            >
              Retract
            </Button>
          </>
        )}
        <p className="w-full text-[11px] text-[var(--ink-faint)] sm:w-auto sm:ml-auto">
          Timeout / self-check: hệ thống tự chạy lại bước (tối đa ~16 lần). Giữ tab mở khi dùng
          “Cả chu trình”.
        </p>
      </section>

      <ArticleImageStudio
        article={article}
        running={running}
        onArticleUpdate={(next) => {
          setArticle(next as Article);
          setTab("clean");
        }}
        onLog={(level, message) => pushLog(level, message)}
      />

      {awaitingHuman && (
        <HumanReviewGate
          knowledgeRecord={article.knowledgeRecord}
          revisionRequired={[
            "MINOR_REVISION_REQUIRED",
            "MAJOR_REVISION_REQUIRED",
            "REWRITE_REQUIRED",
          ].includes(article.workflowState)}
          running={running}
          onConfirm={async ({ items, notes: humanNotes }) => {
            const result = await callAction("confirm-human-review", {
              items,
              notes: humanNotes,
            });
            if (result.article && !isAwaitingHumanReview(result.article)) {
              const needsRevision = [
                "MINOR_REVISION_REQUIRED",
                "MAJOR_REVISION_REQUIRED",
                "REWRITE_REQUIRED",
              ].includes(result.article.workflowState);
              pushLog(
                "info",
                needsRevision
                  ? "→ Sửa draft theo đúng các điểm anh chọn, sau đó re-review + Fact-check..."
                  : "→ Tiếp tục Fact-check...",
              );
              await callAction("run-step");
            }
          }}
        />
      )}

      {(article.workflowState === "PUBLISH_READY" || article.workflowState === "APPROVED") && (
        <ApproveGate
          status={article.status}
          hasHero={Boolean(article.heroImageUrl)}
          running={running}
          notes={notes}
          onNotesChange={setNotes}
          knowledgeRecord={article.knowledgeRecord}
          domain={article.domain}
          cleanPublish={article.cleanPublish}
          researchBrief={article.researchBrief}
          onApprove={(opts) => {
            void callAction("approve", opts);
          }}
          onPublish={() => {
            void callAction("publish");
          }}
        />
      )}

      <RemediationTimeline
        articleId={article.id}
        workflowVersion={article.workflowVersion}
      />
      <EditorValidationFeedback
        articleId={article.id}
        workflowState={article.workflowState}
        workflowVersion={article.workflowVersion}
        errorMessage={article.errorMessage}
        deskJson={article.deskJson}
        running={running}
        onArticleUpdate={(next) => setArticle(next as Article)}
        onLog={(level, message) => pushLog(level, message)}
      />

      <section className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-faint)]">
          Nhật ký / đầu ra
        </p>
        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
          Đây không phải các bước quy trình — chỉ xem nội dung từng giai đoạn đã sinh.
        </p>
      </section>

      <section className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <nav className="flex flex-row gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {TABS.map((t) => {
            const hasContent = Boolean(contentMap[t.key]);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`min-w-[140px] rounded-2xl border px-3.5 py-3 text-left transition lg:min-w-0 ${
                  tab === t.key
                    ? "border-[var(--accent)] bg-white shadow-[0_0_0_4px_var(--accent-glow)]"
                    : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--ink)]">{t.label}</span>
                  <span
                    className={`h-2 w-2 rounded-full ${hasContent ? "bg-[var(--accent)]" : "bg-[var(--line-strong)]"}`}
                  />
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--ink-faint)]">{t.desc}</p>
              </button>
            );
          })}
        </nav>

        <article className="surface-card min-h-[420px] p-6 sm:p-8">
          {activeTab && (
            <header className="mb-6 border-b border-[var(--line)] pb-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-[family-name:var(--font-source-serif)] text-xl font-semibold text-[var(--ink)]">
                    {activeTab.label}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--ink-muted)]">{activeTab.desc}</p>
                </div>
                {tab === "clean" && activeContent && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={running}
                      onClick={() => void copyCleanMarkdown()}
                    >
                      {copyState === "ok" ? "Đã copy" : copyState === "err" ? "Lỗi copy" : "Copy Markdown"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={running}
                      onClick={downloadCleanMarkdown}
                    >
                      Tải .md
                    </Button>
                  </div>
                )}
              </div>
            </header>
          )}

          {tab === "desk" ? (
            <EditorialSummaryPanel article={article} />
          ) : tab === "fact" ? (
            <FactLedgerPanel
              articleId={article.id}
              factCheck={article.factCheck}
              deskJson={article.deskJson}
              workflowState={article.workflowState}
              running={running}
              onArticleUpdate={(next) => setArticle(next as Article)}
              onLog={(level, message) => pushLog(level, message)}
            />
          ) : tab === "clean" ? (
            <>
              <CleanEditPanel
                articleId={article.id}
                cleanPublish={article.cleanPublish}
                workflowState={article.workflowState}
                running={running}
                onArticleUpdate={(next) => setArticle(next as Article)}
                onLog={(level, message) => pushLog(level, message)}
              />
              {activeContent && activeContent !== "ready" ? (
                <>
                  {article.heroImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={article.heroImageUrl}
                      alt={article.heroImageAlt || "Hero"}
                      className="mb-6 w-full rounded-2xl border border-[var(--line)] object-cover"
                    />
                  )}
                  <MarkdownView content={activeContent} />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm font-medium text-[var(--ink-muted)]">Chưa có bản sạch</p>
                </div>
              )}
            </>
          ) : tab === "draft" ? (
            <>
              <ManualDraftRecoveryPanel
                articleId={article.id}
                workflowVersion={article.workflowVersion}
                errorMessage={article.errorMessage}
                draft12={article.draft12}
                running={running}
                onArticleUpdate={(next) => setArticle(next as Article)}
                onLog={(level, message) => pushLog(level, message)}
              />
              {activeContent && activeContent !== "ready" ? (
                <MarkdownView content={activeContent} />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <p className="text-sm font-medium text-[var(--ink-muted)]">Chưa có bản nháp</p>
                </div>
              )}
            </>
          ) : activeContent && activeContent !== "ready" ? (
            <MarkdownView content={activeContent} />
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-[var(--ink-muted)]">Chưa có nội dung</p>
              <p className="mt-1 max-w-sm text-xs text-[var(--ink-faint)]">
                Chạy chu trình để sinh {activeTab?.label.toLowerCase()}.
              </p>
              {!TERMINAL_WORKFLOW_STATES.has(article.workflowState) && (
                <Button size="sm" className="mt-4" disabled={running} onClick={() => callAction("run-step")}>
                  Chạy bước tiếp theo
                </Button>
              )}
            </div>
          )}
        </article>
      </section>
    </AppShell>
  );
}
