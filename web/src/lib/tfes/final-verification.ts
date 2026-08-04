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
};

function numberAfter(text: string, label: RegExp): number | null {
  const line = text
    .split(/\r?\n/)
    .find((candidate) => new RegExp(label.source, "i").test(candidate));
  const normalized = (line ?? "").replace(/[*`]/g, "");
  const match = normalized.match(
    new RegExp(`${label.source}\\s*[:：=]\\s*(\\d{1,3})`, "i"),
  );
  return match ? Number(match[1]) : null;
}

function machineEnum(text: string, label: string, values: string[]): string {
  const line = text
    .split(/\r?\n/)
    .find((candidate) => candidate.toUpperCase().includes(label));
  if (!line) return "";
  const matches = values.filter((value) =>
    new RegExp(`\\b${value}\\b`, "i").test(line),
  );
  return matches.length === 1 ? matches[0] : "";
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
  const machineReadable =
    totalScore !== null &&
    insightScore !== null &&
    openActions !== null &&
    Boolean(gatesStatus) &&
    Boolean(decision);
  const failureReasons: string[] = [];
  if (totalScore === null) failureReasons.push("thiếu FINAL_TOTAL_SCORE");
  else if (totalScore < TFES_CONTRACT.finalReview.minimumTotalScore) {
    failureReasons.push(`total ${totalScore}<${TFES_CONTRACT.finalReview.minimumTotalScore}`);
  }
  if (insightScore === null) failureReasons.push("thiếu FINAL_INSIGHT_SCORE");
  else if (insightScore < TFES_CONTRACT.finalReview.minimumInsightScore) {
    failureReasons.push(`insight ${insightScore}<${TFES_CONTRACT.finalReview.minimumInsightScore}`);
  }
  if (!gatesStatus) failureReasons.push("thiếu GATES_G1_G8");
  else if (!gatesPassed) failureReasons.push("G1–G8 chưa đạt");
  if (!factPassed) failureReasons.push("Fact Check chưa PASSED");
  if (openActions === null) failureReasons.push("thiếu OPEN_REQUIRED_ACTIONS");
  else if (openActions !== 0) failureReasons.push(`${openActions} required action còn mở`);
  if (!decision) failureReasons.push("thiếu FINAL_DECISION");
  if (blockingClaims > 0) failureReasons.push(`${blockingClaims} blocking claim`);

  return {
    totalScore,
    insightScore,
    gatesPassed,
    factPassed,
    openActions,
    blockingClaims,
    machineReadable,
    failureReasons,
    publishReady:
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
