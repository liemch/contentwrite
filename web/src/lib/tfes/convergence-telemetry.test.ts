import { describe, expect, it } from "vitest";
import {
  buildConvergenceTelemetry,
  readTelemetryScore,
} from "@/lib/tfes/convergence-telemetry";

describe("WP-V2-01 convergence telemetry", () => {
  it("marks a post-revision candidate regression without changing any decision", () => {
    expect(
      buildConvergenceTelemetry({
        observation: "editorial",
        currentScore: 63,
        previousEditorialScore: 85,
        isPostRevisionReview: true,
        rewriteCount: 2,
      }),
    ).toEqual({
      observation: "editorial",
      currentScore: 63,
      previousEditorialScore: 85,
      scoreDelta: -22,
      scoreDirection: "declined",
      candidateRegression: true,
      finalRegression: null,
      retryConverging: false,
      rewriteCount: 2,
    });
  });

  it("marks non-decreasing retry convergence and keeps first reviews neutral", () => {
    expect(
      buildConvergenceTelemetry({
        observation: "editorial",
        currentScore: 88,
        previousEditorialScore: 85,
        isPostRevisionReview: true,
        rewriteCount: 1,
      }),
    ).toMatchObject({
      scoreDelta: 3,
      scoreDirection: "improved",
      candidateRegression: false,
      retryConverging: true,
    });
    expect(
      buildConvergenceTelemetry({
        observation: "editorial",
        currentScore: 85,
        previousEditorialScore: null,
        isPostRevisionReview: false,
        rewriteCount: 0,
      }),
    ).toMatchObject({
      scoreDelta: null,
      scoreDirection: "unknown",
      candidateRegression: null,
      retryConverging: null,
    });
  });

  it("records Final score regression against the latest Editorial score", () => {
    expect(
      buildConvergenceTelemetry({
        observation: "final",
        currentScore: 82,
        previousEditorialScore: 88,
        rewriteCount: 1,
      }),
    ).toMatchObject({
      scoreDelta: -6,
      scoreDirection: "declined",
      candidateRegression: null,
      finalRegression: true,
      retryConverging: null,
    });
  });

  it("records rewrite count without inventing a score delta", () => {
    expect(
      buildConvergenceTelemetry({
        observation: "rewrite",
        previousEditorialScore: 56,
        rewriteCount: 3,
      }),
    ).toEqual({
      observation: "rewrite",
      currentScore: null,
      previousEditorialScore: 56,
      scoreDelta: null,
      scoreDirection: "unknown",
      candidateRegression: null,
      finalRegression: null,
      retryConverging: null,
      rewriteCount: 3,
    });
  });

  it("reads legacy-safe scores and ignores malformed details", () => {
    expect(readTelemetryScore({ telemetry: { totalScore: 85 } })).toBe(85);
    expect(readTelemetryScore({ telemetry: { totalScore: "85" } })).toBeNull();
    expect(readTelemetryScore({ totalScore: 85 })).toBeNull();
    expect(readTelemetryScore(null)).toBeNull();
  });

  it("adds lock telemetry only for lock-aware observations", () => {
    expect(
      buildConvergenceTelemetry({
        observation: "editorial",
        currentScore: 63,
        previousEditorialScore: 85,
        isPostRevisionReview: true,
        rewriteCount: 1,
        candidateLock: {
          bestEditorialScore: 85,
          candidateEditorialScore: 63,
          candidateScoreDelta: -22,
          candidateRegression: true,
          candidateRejected: true,
          keptCandidateRevision: 1,
          rejectedCandidateRevision: 2,
          epsilon: 0,
          lockEnabled: true,
          acceptedDespiteRegression: false,
          restoreStatus: "restored",
        },
      }),
    ).toMatchObject({
      bestEditorialScore: 85,
      candidateEditorialScore: 63,
      candidateScoreDelta: -22,
      candidateRegression: true,
      candidateRejected: true,
      keptCandidateRevision: 1,
      rejectedCandidateRevision: 2,
      epsilon: 0,
      lockEnabled: true,
      acceptedDespiteRegression: false,
      restoreStatus: "restored",
    });
  });
});
