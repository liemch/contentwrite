import { describe, expect, it } from "vitest";
import { evaluateRegressionAutoAckBrake } from "@/lib/tfes/regression-auto-ack-brake";

function evaluate(input: {
  enabled?: boolean;
  candidateEligible?: boolean;
  candidateRegression?: boolean | null;
  bestScore?: number | null;
  candidateScore?: number | null;
  scoreDelta?: number | null;
  epsilon?: number;
}) {
  return evaluateRegressionAutoAckBrake({
    enabled: true,
    isPostRevisionReview: true,
    candidateEligible: true,
    candidateRegression: false,
    bestScore: 85,
    candidateScore: 85,
    scoreDelta: 0,
    epsilon: 0,
    ...input,
  });
}

describe("WP-V2-05 Regression Auto-ack Brake", () => {
  it("suppresses 85 -> 63 and routes to human intervention", () => {
    expect(
      evaluate({
        candidateRegression: true,
        candidateScore: 63,
        scoreDelta: -22,
      }),
    ).toMatchObject({
      autoAckSuppressedForRegression: true,
      humanBrakeTriggered: true,
      suppressAutoAck: true,
      reason: "regression",
    });
  });

  it.each([
    [85, 0],
    [86, 1],
  ])("allows non-regressing candidate %s", (candidateScore, scoreDelta) => {
    expect(evaluate({ candidateScore, scoreDelta })).toMatchObject({
      autoAckSuppressedForRegression: false,
      humanBrakeTriggered: false,
      suppressAutoAck: false,
    });
  });

  it("honors epsilon=2 for 85 -> 84", () => {
    expect(
      evaluate({
        candidateScore: 84,
        scoreDelta: -1,
        epsilon: 2,
        candidateRegression: false,
      }),
    ).toMatchObject({
      suppressAutoAck: false,
      humanBrakeTriggered: false,
    });
  });

  it("fails safe to human review for malformed/no-score candidates", () => {
    expect(
      evaluate({
        candidateEligible: false,
        candidateRegression: null,
        candidateScore: null,
        scoreDelta: null,
      }),
    ).toMatchObject({
      suppressAutoAck: true,
      humanBrakeTriggered: true,
      reason: "unreadable",
    });
  });

  it("preserves legacy auto-ack when the independent flag is off", () => {
    expect(
      evaluate({
        enabled: false,
        candidateRegression: true,
        candidateScore: 63,
        scoreDelta: -22,
      }),
    ).toMatchObject({
      brakeEnabled: false,
      suppressAutoAck: false,
      reason: "disabled",
    });
  });

  it("does not trigger on a first Editorial review", () => {
    expect(
      evaluateRegressionAutoAckBrake({
        enabled: true,
        isPostRevisionReview: false,
        candidateEligible: false,
        candidateRegression: null,
        bestScore: null,
        candidateScore: null,
        scoreDelta: null,
        epsilon: 0,
      }),
    ).toMatchObject({
      autoAckEligible: false,
      suppressAutoAck: false,
      reason: "not-eligible",
    });
  });
});
