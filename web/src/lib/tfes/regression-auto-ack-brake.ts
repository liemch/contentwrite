import type { AutoAckBrakeTelemetry } from "@/lib/tfes/remediation-telemetry";

export type RegressionAutoAckBrakeResult = AutoAckBrakeTelemetry & {
  suppressAutoAck: boolean;
};

/** Pure controller. If lock is off, it still pauses but never claims the best was restored. */
export function evaluateRegressionAutoAckBrake(input: {
  enabled: boolean;
  isPostRevisionReview: boolean;
  candidateEligible: boolean;
  candidateRegression: boolean | null;
  bestScore: number | null;
  candidateScore: number | null;
  scoreDelta: number | null;
  epsilon: number;
}): RegressionAutoAckBrakeResult {
  const autoAckEligible = input.isPostRevisionReview;
  if (!input.enabled) {
    return {
      autoAckEligible,
      autoAckSuppressedForRegression: false,
      bestScore: input.bestScore,
      candidateScore: input.candidateScore,
      scoreDelta: input.scoreDelta,
      epsilon: input.epsilon,
      humanBrakeTriggered: false,
      brakeEnabled: false,
      reason: "disabled",
      suppressAutoAck: false,
    };
  }
  if (!input.isPostRevisionReview) {
    return {
      autoAckEligible: false,
      autoAckSuppressedForRegression: false,
      bestScore: input.bestScore,
      candidateScore: input.candidateScore,
      scoreDelta: input.scoreDelta,
      epsilon: input.epsilon,
      humanBrakeTriggered: false,
      brakeEnabled: true,
      reason: "not-eligible",
      suppressAutoAck: false,
    };
  }
  const regression = input.candidateRegression === true;
  const unreadable = !input.candidateEligible;
  const suppressAutoAck = regression || unreadable;
  return {
    autoAckEligible: true,
    autoAckSuppressedForRegression: regression,
    bestScore: input.bestScore,
    candidateScore: input.candidateScore,
    scoreDelta: input.scoreDelta,
    epsilon: input.epsilon,
    humanBrakeTriggered: suppressAutoAck,
    brakeEnabled: true,
    reason: regression ? "regression" : unreadable ? "unreadable" : "not-eligible",
    suppressAutoAck,
  };
}
