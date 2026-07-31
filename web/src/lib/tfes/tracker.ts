import {
  INSIGHT_DECISION_MARK,
  INSIGHT_DONE_MARK,
  INSIGHT_GATE_MARK,
  READER_SIM_DONE_MARK,
  REVIEW_DONE_MARK,
  WRITE_DONE_MARK,
  WRITE_HALF_MARK,
  gateRetryCount,
} from "@/lib/tfes/parser";

/** 10 bước Operating Prompt + Insight Gate (UI tracker) — nhãn tiếng Việt */
export const TFES_TRACKER_STEPS = [
  { id: "1", label: "1. Editorial Memory", short: "Memory" },
  { id: "2", label: "2. Research", short: "Nghiên cứu" },
  { id: "3", label: "3. Verification", short: "Đối chiếu" },
  { id: "4", label: "4. Synthesis", short: "Tổng hợp" },
  { id: "gate", label: "Insight Gate ≥ L2", short: "Cổng L2" },
  { id: "5", label: "5. Decision", short: "Quyết định" },
  { id: "6", label: "6. Planning", short: "Lập kế hoạch" },
  { id: "7", label: "7. Writing", short: "Viết bài" },
  { id: "8", label: "8. Review", short: "Tự review" },
  { id: "9", label: "9. Fact Check", short: "Fact-check" },
  { id: "10", label: "10. Publish Ready", short: "Xuất bản" },
] as const;

export type TfesTrackerId = (typeof TFES_TRACKER_STEPS)[number]["id"];

type ArticleLike = {
  status?: string | null;
  currentStep?: string | null;
  researchBrief?: string | null;
  insightGate?: string | null;
  draft12?: string | null;
  factCheck?: string | null;
  knowledgeRecord?: string | null;
  cleanPublish?: string | null;
};

const SEARCH_MARK = "<!--TFES_SEARCH_BLOB-->";

/**
 * Sàn tiến độ theo currentStep trên DB.
 * Tránh UI kẹt bước Memory khi artifact (brief) trống/lệch nhưng bước đã sang INSIGHT/WRITE/FINALIZE.
 */
function floorFromCurrentStep(currentStep: string | null | undefined): number {
  switch (currentStep) {
    case "INSIGHT":
      return 4;
    case "WRITE":
      return 7;
    case "FINALIZE":
      return 8;
    default:
      return 0;
  }
}

function finalizeArtifactsIndex(article: {
  draft12?: string | null;
  factCheck?: string | null;
  knowledgeRecord?: string | null;
  cleanPublish?: string | null;
}): number {
  const draft = article.draft12 ?? "";
  const fact = article.factCheck ?? "";
  const knowledge = article.knowledgeRecord ?? "";
  const clean = (article.cleanPublish ?? "").trim();

  if (!draft.trim()) return 7;
  if (draft.includes(WRITE_HALF_MARK) && !draft.includes(WRITE_DONE_MARK)) return 7;
  if (!draft.includes(WRITE_DONE_MARK) && draft.trim()) return 7;

  const reviewDone = knowledge.includes(REVIEW_DONE_MARK) || Boolean(fact.trim());
  if (!reviewDone) return 8;
  if (!fact.trim()) return 9;
  if (clean.length < 80) return 10;
  if (!clean.includes("<!--TFES_CLEAN_POLISHED-->")) return 10;
  if (!knowledge.includes(READER_SIM_DONE_MARK)) return 10;
  return TFES_TRACKER_STEPS.length;
}

/**
 * Index bước tracker đang active (0-based).
 * Artifact-first, rồi max với currentStep floor — không tụt lùi về bước 1 oan.
 */
export function resolveTrackerIndex(article: ArticleLike): number {
  const status = article.status ?? "";
  if (status === "PUBLISH_READY" || status === "APPROVED" || status === "PUBLISHED") {
    return TFES_TRACKER_STEPS.length;
  }

  const brief = article.researchBrief ?? "";
  const insight = article.insightGate ?? "";
  const floor = floorFromCurrentStep(article.currentStep);

  let byArtifacts: number;

  if (!brief.trim()) {
    // Memory gộp tick Research — highlight Research (không kẹt “Memory” mãi)
    byArtifacts = 1;
  } else if (brief.includes(SEARCH_MARK)) {
    byArtifacts = 2; // Verification (+ Synthesis cùng phase LLM)
  } else if (!insight.trim()) {
    byArtifacts = 4; // Gate
  } else if (insight.includes(INSIGHT_DONE_MARK)) {
    byArtifacts = finalizeArtifactsIndex(article);
  } else if (insight.includes(INSIGHT_DECISION_MARK)) {
    byArtifacts = 6; // Planning
  } else if (insight.includes(INSIGHT_GATE_MARK)) {
    byArtifacts = status === "FAILED" ? 4 : 5; // Decision
  } else if (gateRetryCount(insight) > 0) {
    byArtifacts = 4;
  } else {
    byArtifacts = status === "FAILED" ? 4 : 5;
  }

  // Draft đã xong nhưng insight mark lệch — vẫn đẩy Finalize
  const draft = article.draft12 ?? "";
  if (draft.includes(WRITE_DONE_MARK)) {
    byArtifacts = Math.max(byArtifacts, finalizeArtifactsIndex(article));
  }

  return Math.max(byArtifacts, floor);
}

/** Nhãn micro-step cho subtitle / CTA (tiếng Việt) */
export function resolveMicroStepLabel(article: ArticleLike): string {
  const status = article.status ?? "";
  if (status === "PUBLISH_READY" || status === "APPROVED" || status === "PUBLISHED") {
    return "Chờ duyệt / đã xong";
  }
  if (status === "FAILED") {
    const idx = resolveTrackerIndex(article);
    const step = TFES_TRACKER_STEPS[Math.min(idx, TFES_TRACKER_STEPS.length - 1)];
    return `Lỗi tại: ${step.label}`;
  }

  const idx = resolveTrackerIndex(article);
  if (idx >= TFES_TRACKER_STEPS.length) return "Chờ duyệt / đã xong";

  const brief = article.researchBrief ?? "";
  const clean = article.cleanPublish ?? "";
  const knowledge = article.knowledgeRecord ?? "";
  const retries = gateRetryCount(article.insightGate);
  const retryNote = retries > 0 && idx <= 4 ? ` · sau Gate fail lần ${retries}` : "";

  if (idx <= 1 && !brief.trim()) {
    return `1–2 · Memory + Research${retryNote}`;
  }
  if (brief.includes(SEARCH_MARK)) {
    return "3–4 · Verification + Synthesis";
  }
  if (idx === 10 && clean.trim().length >= 80) {
    if (!clean.includes("<!--TFES_CLEAN_POLISHED-->")) {
      return "10b · Polish bản sạch";
    }
    if (!knowledge.includes(READER_SIM_DONE_MARK)) {
      return "10c · Reader Simulation";
    }
  }

  const step = TFES_TRACKER_STEPS[idx];
  return `${step.label}${retryNote}`;
}

export function isTrackerStepDone(index: number, activeIndex: number, status: string): boolean {
  if (status === "PUBLISH_READY" || status === "APPROVED" || status === "PUBLISHED") return true;
  return index < activeIndex;
}
