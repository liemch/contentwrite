import { parseFactClaims, verificationStatus } from "@/lib/tfes/fact-ledger";

export type FinalVerification = {
  totalScore: number | null;
  insightScore: number | null;
  gatesPassed: boolean;
  factPassed: boolean;
  openActions: number | null;
  publishReady: boolean;
};

function numberAfter(text: string, label: RegExp): number | null {
  const match = text.match(new RegExp(`${label.source}\\s*[:：]\\s*(\\d{1,3})`, "i"));
  return match ? Number(match[1]) : null;
}

export function inspectFinalVerification(
  review: string | null | undefined,
  factCheck: string | null | undefined,
): FinalVerification {
  const body = review ?? "";
  const totalScore = numberAfter(body, /FINAL_TOTAL_SCORE/);
  const insightScore = numberAfter(body, /FINAL_INSIGHT_SCORE/);
  const openActions = numberAfter(body, /OPEN_REQUIRED_ACTIONS/);
  const gatesPassed = /GATES_G1_G8\s*[:：]\s*PASSED\b/i.test(body);
  const factPassed = /^PASSED$/i.test(verificationStatus(factCheck));
  const claims = parseFactClaims(factCheck);
  const hasBlockingClaim = claims.some((claim) =>
    /Unsupported|Contradicted|Unverifiable|FAIL/i.test(claim.aiVerdict),
  );

  return {
    totalScore,
    insightScore,
    gatesPassed,
    factPassed,
    openActions,
    publishReady:
      totalScore !== null &&
      totalScore >= 95 &&
      insightScore !== null &&
      insightScore >= 22 &&
      gatesPassed &&
      factPassed &&
      openActions === 0 &&
      !hasBlockingClaim,
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

