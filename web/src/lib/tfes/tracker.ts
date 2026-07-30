import {
  INSIGHT_DECISION_MARK,
  INSIGHT_DONE_MARK,
  INSIGHT_GATE_MARK,
  REVIEW_DONE_MARK,
  WRITE_DONE_MARK,
  WRITE_HALF_MARK,
} from "@/lib/tfes/parser";

/** 10 bước Operating Prompt + Insight Gate (UI tracker) */
export const TFES_TRACKER_STEPS = [
  { id: "1", label: "1. Memory", short: "Memory" },
  { id: "2", label: "2. Research", short: "Research" },
  { id: "3", label: "3. Verify", short: "Verify" },
  { id: "4", label: "4. Synth", short: "Synth" },
  { id: "gate", label: "Gate L2", short: "Gate" },
  { id: "5", label: "5. Decision", short: "Decision" },
  { id: "6", label: "6. Planning", short: "Plan" },
  { id: "7", label: "7. Writing", short: "Write" },
  { id: "8", label: "8. Review", short: "Review" },
  { id: "9", label: "9. Fact", short: "Fact" },
  { id: "10", label: "10. Publish", short: "Publish" },
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
 * Index bước tracker đang active (0-based).
 * Các bước gộp tick: Memory+Research search; Verify+Synth một LLM; Writing 2 nửa…
 */
export function resolveTrackerIndex(article: ArticleLike): number {
  const status = article.status ?? "";
  if (status === "PUBLISH_READY" || status === "APPROVED" || status === "PUBLISHED") {
    return TFES_TRACKER_STEPS.length;
  }

  const brief = article.researchBrief ?? "";
  const insight = article.insightGate ?? "";
  const draft = article.draft12 ?? "";
  const fact = article.factCheck ?? "";
  const knowledge = article.knowledgeRecord ?? "";
  const clean = (article.cleanPublish ?? "").trim();

  // Chưa search / đang RESEARCH không có blob
  if (!brief.trim()) return 0; // Memory (bắt đầu)
  if (brief.includes(SEARCH_MARK)) return 2; // Verify+Synth sắp chạy (Research search xong → bước 3)

  // Research Brief LLM xong → Insight Gate
  if (!insight.trim()) return 4; // Gate

  if (insight.includes(INSIGHT_DONE_MARK)) {
    // sang Writing / Finalize
  } else if (insight.includes(INSIGHT_DECISION_MARK)) {
    return 6; // Planning
  } else if (insight.includes(INSIGHT_GATE_MARK)) {
    // Gate fail vẫn gắn GATE_MARK — highlight Gate
    if (status === "FAILED") return 4;
    return 5; // Decision
  } else if (insight.trim()) {
    return status === "FAILED" ? 4 : 5;
  }

  // Writing
  if (!draft.trim()) return 7;
  if (draft.includes(WRITE_HALF_MARK) && !draft.includes(WRITE_DONE_MARK)) return 7;
  if (!draft.includes(WRITE_DONE_MARK) && draft.trim()) return 7;

  // Finalize
  const reviewDone = knowledge.includes(REVIEW_DONE_MARK) || Boolean(fact.trim());
  if (!reviewDone) return 8;
  if (!fact.trim()) return 9;
  if (clean.length < 80) return 10;
  return TFES_TRACKER_STEPS.length;
}

export function isTrackerStepDone(index: number, activeIndex: number, status: string): boolean {
  if (status === "PUBLISH_READY" || status === "APPROVED" || status === "PUBLISHED") return true;
  return index < activeIndex;
}
