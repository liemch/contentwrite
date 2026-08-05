/**
 * Machine gate cho bước 8 (Editorial Review) — align gần bar 9b
 * để bài yếu không lọt thẳng Fact → Final Verification.
 */
import { WorkflowState } from "@/generated/prisma/client";
import { TFES_CONTRACT } from "@/lib/tfes/contract";

export type EditorialReviewInspection = {
  totalScore: number | null;
  insightScore: number | null;
  gatesPassed: boolean;
  gateFailCount: number;
  decision: string;
  machineReadable: boolean;
  /** State sau khi override theo điểm (nếu model tự khai EDITORIAL_REVIEWED oan). */
  resolvedState: WorkflowState;
  failureReasons: string[];
};

function numberAfter(text: string, label: RegExp): number | null {
  let found: number | null = null;
  for (const candidate of text.split(/\r?\n/)) {
    if (!new RegExp(label.source, "i").test(candidate)) continue;
    const normalized = candidate.replace(/[*`]/g, "");
    const match = normalized.match(
      new RegExp(`${label.source}\\s*[:：=]\\s*(\\d{1,3})`, "i"),
    );
    if (match) found = Number(match[1]);
  }
  return found;
}

function machineEnum(text: string, label: string, values: string[]): string {
  let found = "";
  for (const candidate of text.split(/\r?\n/)) {
    if (!candidate.toUpperCase().includes(label)) continue;
    const matches = values.filter((value) =>
      new RegExp(`\\b${value}\\b`, "i").test(candidate),
    );
    if (matches.length === 1) found = matches[0];
  }
  return found;
}

/** Đếm G1–G8 / N* bị đánh Fail trong checklist. */
export function countEditorialGateFails(review: string): number {
  const gateRe =
    /(?:^|\n)\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?((?:G|N)\d+)\s*[^|\n]*?\bFail\b/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = gateRe.exec(review))) {
    seen.add(m[1].toUpperCase());
  }
  return seen.size;
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
  const totalScore =
    numberAfter(body, /PROVISIONAL_TOTAL_SCORE/) ??
    numberAfter(body, /FINAL_TOTAL_SCORE/);
  const insightScore =
    numberAfter(body, /PROVISIONAL_INSIGHT_SCORE/) ??
    numberAfter(body, /FINAL_INSIGHT_SCORE/);
  const gatesStatus = machineEnum(body, "GATES_G1_G8", ["PASSED", "FAILED"]);
  const decision = machineEnum(body, "EDITORIAL_DECISION", [
    "EDITORIAL_REVIEWED",
    "MINOR_REVISION_REQUIRED",
    "MAJOR_REVISION_REQUIRED",
    "REWRITE_REQUIRED",
  ]) || machineEnum(body, "FINAL_DECISION", [
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
  if (totalScore === null) failureReasons.push("thiếu PROVISIONAL_TOTAL_SCORE");
  if (insightScore === null) failureReasons.push("thiếu PROVISIONAL_INSIGHT_SCORE");
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
    failureReasons.push("thiếu EDITORIAL_DECISION hợp lệ");
  }

  const fieldsPresent = totalScore !== null && insightScore !== null;
  const degenerate = totalScore === 0 && insightScore === 0;
  const machineReadable = fieldsPresent && !degenerate;

  let resolvedState: WorkflowState;
  if (!machineReadable) {
    // Fallback enum / regex như trước — nhưng Fail gate → không cho EDITORIAL_REVIEWED
    const fromEnum = stateFromEnum(normalizedDecision);
    const fromText = /REWRITE_REQUIRED/i.test(body)
      ? WorkflowState.REWRITE_REQUIRED
      : /MAJOR_REVISION_REQUIRED/i.test(body)
        ? WorkflowState.MAJOR_REVISION_REQUIRED
        : /MINOR_REVISION_REQUIRED/i.test(body)
          ? WorkflowState.MINOR_REVISION_REQUIRED
          : WorkflowState.EDITORIAL_REVIEWED;
    resolvedState = fromEnum ?? fromText;
    if (
      resolvedState === WorkflowState.EDITORIAL_REVIEWED &&
      (gateFailCount > 0 || gatesStatus === "FAILED")
    ) {
      resolvedState = WorkflowState.MINOR_REVISION_REQUIRED;
      failureReasons.push("còn gate Fail — không cho EDITORIAL_REVIEWED");
    }
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
    resolvedState,
    failureReasons,
  };
}
