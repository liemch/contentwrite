/**
 * Machine gate cho bước 8 (Editorial Review) — align gần bar 9b
 * để bài yếu không lọt thẳng Fact → Final Verification.
 */
import { WorkflowState } from "@/generated/prisma/client";
import { TFES_CONTRACT } from "@/lib/tfes/contract";
import { parseEditorialGateFailures } from "@/lib/tfes/editorial-checklist";

export const EDITORIAL_REVIEW_MACHINE_KEYS = [
  "PROVISIONAL_TOTAL_SCORE",
  "PROVISIONAL_INSIGHT_SCORE",
  "GATES_G1_G8",
  "EDITORIAL_DECISION",
] as const;

export const LEGACY_EDITORIAL_REVIEW_MACHINE_KEYS = [
  "FINAL_TOTAL_SCORE",
  "FINAL_INSIGHT_SCORE",
  "GATES_G1_G8",
  "FINAL_DECISION",
] as const;

export type EditorialReviewInspection = {
  totalScore: number | null;
  insightScore: number | null;
  gatesPassed: boolean;
  gateFailCount: number;
  decision: string;
  machineReadable: boolean;
  machineContract: "canonical" | "legacy" | "invalid";
  /** State sau khi override theo điểm (nếu model tự khai EDITORIAL_REVIEWED oan). */
  resolvedState: WorkflowState;
  failureReasons: string[];
};

function machineNumber(text: string, key: string): number | null {
  let found: number | null = null;
  for (const candidate of text.split(/\r?\n/)) {
    const normalized = candidate.replace(/[*`]/g, "");
    const match = normalized.match(new RegExp(`^\\s*${key}\\s*[:：=]\\s*(\\d{1,3})\\s*$`, "i"));
    if (match) found = Number(match[1]);
  }
  return found;
}

function machineEnum(text: string, key: string, values: readonly string[]): string {
  let found = "";
  for (const candidate of text.split(/\r?\n/)) {
    const normalized = candidate.replace(/[*`]/g, "");
    const match = normalized.match(
      new RegExp(`^\\s*${key}\\s*[:：=]\\s*([A-Z_]+)\\s*$`, "i"),
    );
    if (!match) continue;
    const value = match[1].toUpperCase();
    if (values.includes(value)) found = value;
  }
  return found;
}

/** Đếm G1–G8 / N* bị đánh Fail trong checklist. */
export function countEditorialGateFails(review: string): number {
  return parseEditorialGateFailures(review).length;
}

function stateFromEnum(decision: string): WorkflowState | null {
  if (decision === "REWRITE_REQUIRED") return WorkflowState.REWRITE_REQUIRED;
  if (decision === "MAJOR_REVISION_REQUIRED") {
    return WorkflowState.MAJOR_REVISION_REQUIRED;
  }
  if (decision === "MINOR_REVISION_REQUIRED") {
    return WorkflowState.MINOR_REVISION_REQUIRED;
  }
  if (decision === "EDITORIAL_REVIEWED") return WorkflowState.EDITORIAL_REVIEWED;
  return null;
}

function stateFromScores(
  total: number | null,
  insight: number | null,
  gatesPassed: boolean,
  gateFails: number,
): WorkflowState {
  const minTotal = TFES_CONTRACT.editorialReview.minimumTotalScore;
  const minInsight = TFES_CONTRACT.editorialReview.minimumInsightScore;
  if (
    (insight !== null && insight < minInsight) ||
    (total !== null && total < 75)
  ) {
    return WorkflowState.REWRITE_REQUIRED;
  }
  if (total !== null && total < 85) return WorkflowState.MAJOR_REVISION_REQUIRED;
  if (
    !gatesPassed ||
    gateFails > 0 ||
    (total !== null && total < minTotal) ||
    (insight !== null && insight < minInsight)
  ) {
    return WorkflowState.MINOR_REVISION_REQUIRED;
  }
  return WorkflowState.EDITORIAL_REVIEWED;
}

/**
 * Parse machine lines + checklist Fail; ép EDITORIAL_REVIEWED chỉ khi gần bar 9b.
 */
export function inspectEditorialReview(
  review: string | null | undefined,
): EditorialReviewInspection {
  const body = review ?? "";
  const canonicalTotal = machineNumber(body, "PROVISIONAL_TOTAL_SCORE");
  const canonicalInsight = machineNumber(body, "PROVISIONAL_INSIGHT_SCORE");
  const canonicalDecision = machineEnum(body, "EDITORIAL_DECISION", [
    "EDITORIAL_REVIEWED",
    "MINOR_REVISION_REQUIRED",
    "MAJOR_REVISION_REQUIRED",
    "REWRITE_REQUIRED",
  ]);
  const hasCanonical =
    canonicalTotal !== null || canonicalInsight !== null || Boolean(canonicalDecision);
  const machineContract: EditorialReviewInspection["machineContract"] = hasCanonical
    ? "canonical"
    : machineNumber(body, "FINAL_TOTAL_SCORE") !== null ||
        machineNumber(body, "FINAL_INSIGHT_SCORE") !== null ||
        Boolean(machineEnum(body, "FINAL_DECISION", [
          "EDITORIAL_REVIEWED",
          "FINAL_REVIEWED",
          "MINOR_REVISION_REQUIRED",
          "MAJOR_REVISION_REQUIRED",
          "REWRITE_REQUIRED",
        ]))
      ? "legacy"
      : "invalid";
  const totalScore =
    machineContract === "canonical"
      ? canonicalTotal
      : machineNumber(body, "FINAL_TOTAL_SCORE");
  const insightScore =
    machineContract === "canonical"
      ? canonicalInsight
      : machineNumber(body, "FINAL_INSIGHT_SCORE");
  const gatesStatus = machineEnum(body, "GATES_G1_G8", ["PASSED", "FAILED"]);
  const decision =
    machineContract === "canonical"
      ? canonicalDecision
      : machineEnum(body, "FINAL_DECISION", [
          "EDITORIAL_REVIEWED",
          "FINAL_REVIEWED",
          "MINOR_REVISION_REQUIRED",
          "MAJOR_REVISION_REQUIRED",
          "REWRITE_REQUIRED",
        ]);

  const gateFailCount = countEditorialGateFails(body);
  const gatesPassed =
    gatesStatus === "PASSED" || (gatesStatus === "" && gateFailCount === 0);
  const normalizedDecision =
    decision === "FINAL_REVIEWED" ? "EDITORIAL_REVIEWED" : decision;

  const failureReasons: string[] = [];
  const expectedTotal =
    machineContract === "legacy" ? "FINAL_TOTAL_SCORE" : "PROVISIONAL_TOTAL_SCORE";
  const expectedInsight =
    machineContract === "legacy" ? "FINAL_INSIGHT_SCORE" : "PROVISIONAL_INSIGHT_SCORE";
  const expectedDecision =
    machineContract === "legacy" ? "FINAL_DECISION" : "EDITORIAL_DECISION";
  if (totalScore === null) failureReasons.push(`thiếu ${expectedTotal}`);
  if (insightScore === null) failureReasons.push(`thiếu ${expectedInsight}`);
  if (!gatesStatus && gateFailCount === 0) {
    // Cho phép suy ra từ checklist nếu không có dòng máy
  } else if (gatesStatus === "FAILED" || gateFailCount > 0) {
    failureReasons.push(
      gateFailCount > 0
        ? `${gateFailCount} gate Fail trên checklist`
        : "G1–G8 FAILED",
    );
  }
  if (!normalizedDecision) {
    failureReasons.push(`thiếu ${expectedDecision} hợp lệ`);
  }

  const fieldsPresent =
    totalScore !== null &&
    insightScore !== null &&
    Boolean(gatesStatus) &&
    Boolean(normalizedDecision);
  const degenerate = totalScore === 0 && insightScore === 0;
  const machineReadable = fieldsPresent && !degenerate;

  let resolvedState: WorkflowState;
  if (!machineReadable) {
    // Không quét enum trên toàn văn: template/giải thích có thể liệt kê REWRITE_REQUIRED.
    // Malformed output không được PASS và cũng không được tự nâng thành REWRITE.
    resolvedState = WorkflowState.MINOR_REVISION_REQUIRED;
    failureReasons.push("machine output Editorial Review không hợp lệ — cần chấm lại");
  } else {
    const fromScores = stateFromScores(
      totalScore,
      insightScore,
      gatesPassed && gateFailCount === 0,
      gateFailCount,
    );
    const fromEnum = stateFromEnum(normalizedDecision);
    // Lấy mức nghiêm hơn giữa model và điểm
    const rank = (s: WorkflowState) =>
      s === WorkflowState.REWRITE_REQUIRED
        ? 3
        : s === WorkflowState.MAJOR_REVISION_REQUIRED
          ? 2
          : s === WorkflowState.MINOR_REVISION_REQUIRED
            ? 1
            : 0;
    resolvedState =
      fromEnum && rank(fromEnum) > rank(fromScores) ? fromEnum : fromScores;

    if (
      normalizedDecision === "EDITORIAL_REVIEWED" &&
      resolvedState !== WorkflowState.EDITORIAL_REVIEWED
    ) {
      failureReasons.push(
        `model khai EDITORIAL_REVIEWED nhưng điểm/gate chưa đủ (total=${totalScore}, insight=${insightScore})`,
      );
    }
  }

  return {
    totalScore,
    insightScore,
    gatesPassed: gatesPassed && gateFailCount === 0,
    gateFailCount,
    decision: normalizedDecision,
    machineReadable,
    machineContract,
    resolvedState,
    failureReasons,
  };
}
