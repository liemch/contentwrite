import { parseFactClaims, verificationStatus } from "@/lib/tfes/fact-ledger";
import { TFES_CONTRACT } from "@/lib/tfes/contract";

export type FinalVerification = {
  totalScore: number | null;
  insightScore: number | null;
  gatesPassed: boolean;
  factPassed: boolean;
  openActions: number | null;
  blockingClaims: number;
  machineReadable: boolean;
  failureReasons: string[];
  publishReady: boolean;
  /** LLM dump 0/0 thay vì chấm thật — không được đưa vào vòng REWRITE. */
  degenerateScores: boolean;
};

/**
 * Điểm thoái hoá: cả TOTAL và Insight = 0.
 * Sau Fact Check PASSED gần như không bao giờ hợp lệ — thường là LLM ghi placeholder.
 */
export function isDegenerateFinalScores(
  totalScore: number | null,
  insightScore: number | null,
): boolean {
  return totalScore === 0 && insightScore === 0;
}

/** Prefer last matching line — machine block nằm cuối output. */
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

/**
 * Khi decision ≠ band điểm (vd. MAJOR nhưng score 0), coi là chưa machine-readable
 * để retry 9b — tránh route REWRITE oan.
 */
function decisionConsistentWithScores(
  decision: string,
  totalScore: number | null,
  insightScore: number | null,
): boolean {
  if (!decision || totalScore === null || insightScore === null) return true;
  if (isDegenerateFinalScores(totalScore, insightScore)) return false;

  switch (decision) {
    case "FINAL_REVIEWED":
      return (
        totalScore >= TFES_CONTRACT.finalReview.minimumTotalScore &&
        insightScore >= TFES_CONTRACT.finalReview.minimumInsightScore
      );
    case "MINOR_REVISION_REQUIRED":
      // 85–89: lỗi nhỏ không đổi luận điểm
      return totalScore >= 85 && totalScore < TFES_CONTRACT.finalReview.minimumTotalScore;
    case "MAJOR_REVISION_REQUIRED":
      return totalScore >= 75 && totalScore < 85;
    case "REWRITE_REQUIRED":
      return (
        totalScore < 75 ||
        insightScore < TFES_CONTRACT.finalReview.minimumInsightScore
      );
    default:
      return true;
  }
}

export function inspectFinalVerification(
  review: string | null | undefined,
  factCheck: string | null | undefined,
): FinalVerification {
  const body = review ?? "";
  const totalScore = numberAfter(body, /FINAL_TOTAL_SCORE/);
  const insightScore = numberAfter(body, /FINAL_INSIGHT_SCORE/);
  const openActions = numberAfter(body, /OPEN_REQUIRED_ACTIONS/);
  const gatesStatus = machineEnum(body, "GATES_G1_G8", ["PASSED", "FAILED"]);
  const decision = machineEnum(body, "FINAL_DECISION", [
    "FINAL_REVIEWED",
    "MINOR_REVISION_REQUIRED",
    "MAJOR_REVISION_REQUIRED",
    "REWRITE_REQUIRED",
  ]);
  const gatesPassed = gatesStatus === "PASSED";
  const factPassed = /^PASSED$/i.test(verificationStatus(factCheck));
  const claims = parseFactClaims(factCheck);
  const blockingClaims = claims.filter((claim) => {
    if (/Unsupported|Contradicted|Failed|Major\s*Issue|FAIL/i.test(claim.aiVerdict)) {
      return true;
    }
    if (!/Unverifiable/i.test(claim.aiVerdict)) return false;
    // Unverifiable được phép nếu FactCheck đã phân loại rõ là Opinion/Prediction.
    return !/Opinion|Prediction/i.test(`${claim.kind} ${claim.action}`);
  }).length;

  const degenerateScores = isDegenerateFinalScores(totalScore, insightScore);
  const decisionOk = decisionConsistentWithScores(decision, totalScore, insightScore);

  const failureReasons: string[] = [];
  if (totalScore === null) failureReasons.push("thiếu FINAL_TOTAL_SCORE");
  else if (degenerateScores) {
    failureReasons.push(
      "điểm thoái hoá TOTAL=0 và INSIGHT=0 (không chấp nhận — phải chấm lại theo rubric)",
    );
  } else if (totalScore < TFES_CONTRACT.finalReview.minimumTotalScore) {
    failureReasons.push(`total ${totalScore}<${TFES_CONTRACT.finalReview.minimumTotalScore}`);
  }
  if (insightScore === null) failureReasons.push("thiếu FINAL_INSIGHT_SCORE");
  else if (
    !degenerateScores &&
    insightScore < TFES_CONTRACT.finalReview.minimumInsightScore
  ) {
    failureReasons.push(
      `insight ${insightScore}<${TFES_CONTRACT.finalReview.minimumInsightScore}`,
    );
  }
  if (!gatesStatus) failureReasons.push("thiếu GATES_G1_G8");
  else if (!gatesPassed) failureReasons.push("G1–G8 chưa đạt");
  if (!factPassed) failureReasons.push("Fact Check chưa PASSED");
  if (openActions === null) failureReasons.push("thiếu OPEN_REQUIRED_ACTIONS");
  else if (openActions !== 0) failureReasons.push(`${openActions} required action còn mở`);
  if (!decision) {
    failureReasons.push(
      "thiếu FINAL_DECISION hợp lệ (FINAL_REVIEWED|MINOR_REVISION_REQUIRED|MAJOR_REVISION_REQUIRED|REWRITE_REQUIRED — không dùng PUBLISH_READY)",
    );
  } else if (!decisionOk) {
    failureReasons.push(
      `FINAL_DECISION=${decision} không khớp band điểm (total=${totalScore}, insight=${insightScore})`,
    );
  }
  if (blockingClaims > 0) failureReasons.push(`${blockingClaims} blocking claim`);

  const fieldsPresent =
    totalScore !== null &&
    insightScore !== null &&
    openActions !== null &&
    Boolean(gatesStatus) &&
    Boolean(decision);

  // Điểm 0/0 hoặc decision lệch band → coi như sai format, retry 9b (không REWRITE).
  const machineReadable = fieldsPresent && !degenerateScores && decisionOk;

  return {
    totalScore,
    insightScore,
    gatesPassed,
    factPassed,
    openActions,
    blockingClaims,
    machineReadable,
    failureReasons,
    degenerateScores,
    publishReady:
      machineReadable &&
      totalScore !== null &&
      totalScore >= TFES_CONTRACT.finalReview.minimumTotalScore &&
      insightScore !== null &&
      insightScore >= TFES_CONTRACT.finalReview.minimumInsightScore &&
      gatesPassed &&
      factPassed &&
      openActions === 0 &&
      blockingClaims === 0,
  };
}

export function assertFinalVerificationPassed(
  review: string | null | undefined,
  factCheck: string | null | undefined,
): FinalVerification {
  const result = inspectFinalVerification(review, factCheck);
  if (!result.publishReady) {
    throw new Error(
      `Final Verification chưa đạt: total=${result.totalScore ?? "?"}/100, insight=${result.insightScore ?? "?"}/30, G1-G8=${result.gatesPassed ? "PASSED" : "FAILED"}, Fact=${result.factPassed ? "PASSED" : "FAILED"}, open_actions=${result.openActions ?? "?"}`,
    );
  }
  return result;
}
