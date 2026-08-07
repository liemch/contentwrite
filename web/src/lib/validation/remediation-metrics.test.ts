import { describe, expect, it } from "vitest";
import { aggregateRemediationMetrics } from "../../../scripts/lib/remediation-metrics.mjs";

const telemetry = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: "wp2.7-v1",
  transitionName: "editorial-review",
  totalScore: 90,
  gateFailures: [],
  draftCharacterLength: 5000,
  hasKeyTakeaways: true,
  hasDiscussion: true,
  hasReferences: true,
  llmMs: 1000,
  result: "pass",
  errorClass: null,
  ...overrides,
});

describe("WP2.7 cohort metric aggregation", () => {
  it("calculates rates, G1-G8 distribution, latency, recovery and feedback", () => {
    const metrics = aggregateRemediationMetrics([
      {
        workflowState: "PUBLISHED",
        targetWordCount: 800,
        deskJson: JSON.stringify({
          validationFeedback: {
            finalUsability: 5,
            manualEditEffort: 2,
            errorHelpfulness: 4,
            reuseIntent: 5,
          },
        }),
        transitions: [
          {
            action: "editorial-review",
            createdAt: "2026-08-07T00:00:00Z",
            details: { telemetry: telemetry() },
          },
        ],
      },
      {
        workflowState: "PUBLISH_READY",
        targetWordCount: 800,
        transitions: [
          {
            action: "remediate-required-revision",
            createdAt: "2026-08-07T01:00:00Z",
            details: { telemetry: telemetry({ result: "retry", totalScore: null }) },
          },
          {
            action: "manual-draft-revision",
            createdAt: "2026-08-07T01:01:00Z",
            details: { telemetry: telemetry({ result: "retry", totalScore: 80 }) },
          },
          {
            action: "editorial-review-after-revision",
            createdAt: "2026-08-07T01:02:00Z",
            details: { telemetry: telemetry({ totalScore: 91 }) },
          },
        ],
      },
      {
        workflowState: "FACT_CHECK_FAILED",
        targetWordCount: 800,
        transitions: [
          {
            action: "remediate-fact-check",
            createdAt: "2026-08-07T02:00:00Z",
            details: { telemetry: telemetry({ result: "retry", totalScore: null }) },
          },
          {
            action: "fact-remediation-exhausted",
            createdAt: "2026-08-07T02:01:00Z",
            details: {
              telemetry: telemetry({
                result: "exhausted",
                gateFailures: ["G2"],
                totalScore: 70,
              }),
            },
          },
          {
            action: "final-verification-format-invalid",
            createdAt: "2026-08-07T02:02:00Z",
            details: {
              telemetry: telemetry({
                result: "exhausted",
                errorClass: "parser",
                totalScore: null,
              }),
            },
          },
          {
            action: "workflow-step-error",
            createdAt: "2026-08-07T02:03:00Z",
            details: {
              telemetry: telemetry({
                result: "error",
                errorClass: "timeout",
                llmMs: null,
                totalScore: null,
              }),
            },
          },
        ],
      },
    ]);

    expect(metrics.firstPassRate).toBeCloseTo(1 / 3, 4);
    expect(metrics.remediationPassRate).toBe(0.5);
    expect(metrics.exhaustionRate).toBeCloseTo(1 / 3, 4);
    expect(metrics.gateFailDistribution.G2).toBe(1);
    expect(metrics.parseFormatFailureRate).toBe(1);
    expect(metrics.recoverySuccessRate).toBe(1);
    expect(metrics.editorManualInterventionRate).toBeCloseTo(1 / 3, 4);
    expect(metrics.editorFeedback).toMatchObject({
      responses: 1,
      averageFinalUsability: 5,
      averageReuseIntent: 5,
    });
  });

  it("calculates Fact Check rates and count distributions with explicit denominators", () => {
    const factTelemetry = (
      fact: Record<string, unknown>,
      overrides: Record<string, unknown> = {},
    ) =>
      telemetry({
        transitionName: "fact-check",
        totalScore: null,
        fact,
        ...overrides,
      });
    const passedFact = {
      verdict: "PASSED",
      claimCount: 4,
      blockingClaimCount: 0,
      unsupportedClaimCount: 0,
      unverifiableClaimCount: 0,
      claimsWithoutSourceCount: 0,
      malformedOutput: false,
    };
    const failedFact = {
      verdict: "FAILED",
      claimCount: 4,
      blockingClaimCount: 2,
      unsupportedClaimCount: 1,
      unverifiableClaimCount: 1,
      claimsWithoutSourceCount: 1,
      malformedOutput: false,
    };
    const malformedFact = {
      verdict: null,
      claimCount: 0,
      blockingClaimCount: 0,
      unsupportedClaimCount: 0,
      unverifiableClaimCount: 0,
      claimsWithoutSourceCount: 0,
      malformedOutput: true,
    };

    const metrics = aggregateRemediationMetrics([
      {
        workflowState: "FACT_CHECKED",
        transitions: [
          {
            action: "fact-check",
            success: true,
            createdAt: "2026-08-07T00:00:00Z",
            details: { telemetry: factTelemetry(passedFact) },
          },
        ],
      },
      {
        workflowState: "FACT_CHECKED",
        transitions: [
          {
            action: "fact-check",
            success: false,
            createdAt: "2026-08-07T01:00:00Z",
            details: {
              telemetry: factTelemetry(failedFact, { result: "fail" }),
            },
          },
          {
            action: "remediate-fact-check",
            success: true,
            createdAt: "2026-08-07T01:01:00Z",
            details: { telemetry: telemetry({ result: "retry" }) },
          },
          {
            action: "fact-check",
            success: true,
            createdAt: "2026-08-07T01:02:00Z",
            details: { telemetry: factTelemetry(passedFact) },
          },
        ],
      },
      {
        workflowState: "FACT_CHECK_FAILED",
        transitions: [
          {
            action: "fact-check",
            success: false,
            createdAt: "2026-08-07T02:00:00Z",
            details: {
              telemetry: factTelemetry(malformedFact, {
                result: "fail",
                errorClass: "parser",
              }),
            },
          },
          {
            action: "remediate-fact-check",
            success: true,
            createdAt: "2026-08-07T02:01:00Z",
            details: { telemetry: telemetry({ result: "retry" }) },
          },
          {
            action: "fact-remediation-exhausted",
            success: false,
            createdAt: "2026-08-07T02:02:00Z",
            details: { telemetry: telemetry({ result: "exhausted" }) },
          },
        ],
      },
      {
        workflowState: "EDITORIAL_REVIEWED",
        transitions: [],
      },
    ]);

    expect(metrics.denominators).toMatchObject({
      articles: 4,
      factCheckAttempts: 4,
      articlesWithFactCheck: 3,
      articlesWithFactRemediation: 2,
      factAttemptsWithMalformedFlag: 4,
      factAttemptsWithBlockingCount: 4,
      factAttemptsWithUnsupportedCount: 4,
      factAttemptsWithClaimsWithoutSourceCount: 4,
    });
    expect(metrics.factCheck).toEqual({
      averageAttemptsPerArticle: 1,
      firstPassRate: Number((1 / 3).toFixed(4)),
      remediationPassRate: 0.5,
      blockingClaimDistribution: { "0": 3, "2": 1 },
      unsupportedClaimDistribution: { "0": 3, "1": 1 },
      claimsWithoutSourceDistribution: { "0": 3, "1": 1 },
      malformedOutputRate: 0.25,
    });
    expect(metrics.counts).toMatchObject({
      factCheckAttempts: 4,
      factFirstPassArticles: 1,
      factRemediationPassedArticles: 1,
      malformedFactOutputs: 1,
    });
  });

  it("excludes legacy Fact Check rows from fact-specific field denominators", () => {
    const metrics = aggregateRemediationMetrics([
      {
        workflowState: "FACT_CHECK_FAILED",
        transitions: [
          {
            action: "fact-check",
            success: false,
            createdAt: "2026-08-06T00:00:00Z",
            details: {
              verificationStatus: "FAILED",
              blockingClaims: 2,
            },
          },
        ],
      },
    ]);

    expect(metrics.denominators).toMatchObject({
      factCheckAttempts: 1,
      articlesWithFactCheck: 1,
      factAttemptsWithMalformedFlag: 0,
      factAttemptsWithBlockingCount: 0,
      factAttemptsWithUnsupportedCount: 0,
      factAttemptsWithClaimsWithoutSourceCount: 0,
    });
    expect(metrics.factCheck).toMatchObject({
      averageAttemptsPerArticle: 1,
      firstPassRate: 0,
      malformedOutputRate: null,
      blockingClaimDistribution: {},
    });
  });

  it("aggregates convergence KPIs from legacy-compatible transition scores", () => {
    const review = (
      action: string,
      score: number,
      createdAt: string,
      result: "pass" | "fail" = "pass",
    ) => ({
      action,
      success: result === "pass",
      createdAt,
      details: {
        telemetry: telemetry({
          transitionName: action,
          totalScore: score,
          result,
        }),
      },
    });

    const metrics = aggregateRemediationMetrics([
      {
        workflowState: "REWRITE_REQUIRED",
        transitions: [
          review("editorial-review", 85, "2026-08-07T00:00:00Z"),
          review("final-verification", 85, "2026-08-07T00:01:00Z", "fail"),
          {
            action: "remediate-required-revision",
            createdAt: "2026-08-07T00:02:00Z",
            details: { telemetry: telemetry({ totalScore: null, result: "retry" }) },
          },
          review(
            "editorial-review-after-revision",
            63,
            "2026-08-07T00:03:00Z",
            "fail",
          ),
          {
            action: "remediate-required-revision",
            createdAt: "2026-08-07T00:04:00Z",
            details: { telemetry: telemetry({ totalScore: null, result: "retry" }) },
          },
          review(
            "editorial-review-after-revision",
            56,
            "2026-08-07T00:05:00Z",
            "fail",
          ),
        ],
      },
      {
        workflowState: "MINOR_REVISION_REQUIRED",
        transitions: [
          review("editorial-review", 80, "2026-08-07T01:00:00Z", "fail"),
          {
            action: "remediate-required-revision",
            createdAt: "2026-08-07T01:01:00Z",
            details: { telemetry: telemetry({ totalScore: null, result: "retry" }) },
          },
          review(
            "editorial-review-after-revision",
            88,
            "2026-08-07T01:02:00Z",
          ),
          review("final-verification", 82, "2026-08-07T01:03:00Z", "fail"),
        ],
      },
    ]);

    expect(metrics.denominators).toMatchObject({
      articles: 2,
      editorialScoreComparisons: 3,
      candidateScoreComparisons: 3,
      finalScoreComparisons: 2,
      retryScoreComparisons: 3,
    });
    expect(metrics.convergence).toEqual({
      editorialScoreMonotonicityRate: Number((1 / 3).toFixed(4)),
      averageEditorialScoreDelta: -7,
      candidateRegressionRate: Number((2 / 3).toFixed(4)),
      finalRegressionRate: 0.5,
      averageFinalScoreDelta: -3,
      retryConvergenceRate: Number((1 / 3).toFixed(4)),
      averageRewriteCountPerArticle: 1.5,
    });
    expect(metrics.counts).toMatchObject({
      editorialNonDecreasingComparisons: 1,
      candidateRegressions: 2,
      finalRegressions: 1,
      retryConvergingComparisons: 1,
      rewriteCount: 3,
    });
  });

  it("returns null convergence rates when no score pairs are available", () => {
    const metrics = aggregateRemediationMetrics([
      {
        workflowState: "EDITORIAL_REVIEWED",
        transitions: [
          {
            action: "editorial-review",
            createdAt: "2026-08-07T00:00:00Z",
            details: { telemetry: telemetry({ totalScore: 85 }) },
          },
        ],
      },
    ]);

    expect(metrics.convergence).toEqual({
      editorialScoreMonotonicityRate: null,
      averageEditorialScoreDelta: null,
      candidateRegressionRate: null,
      finalRegressionRate: null,
      averageFinalScoreDelta: null,
      retryConvergenceRate: null,
      averageRewriteCountPerArticle: 0,
    });
  });

  it("aggregates lock-aware retention metrics and excludes legacy rows", () => {
    const lockConvergence = (
      candidateScoreDelta: number,
      candidateRevision: number,
    ) => ({
      observation: "editorial",
      candidateRegression: true,
      candidateRejected: true,
      candidateScoreDelta,
      keptCandidateRevision: 1,
      rejectedCandidateRevision: candidateRevision,
      epsilon: 0,
      lockEnabled: true,
      acceptedDespiteRegression: false,
      restoreStatus: "restored",
    });
    const metrics = aggregateRemediationMetrics([
      {
        workflowState: "REWRITE_REQUIRED",
        transitions: [
          {
            action: "editorial-review-after-revision",
            createdAt: "2026-08-07T00:01:00Z",
            details: {
              telemetry: telemetry({
                totalScore: 63,
                convergence: lockConvergence(-22, 2),
              }),
            },
          },
          {
            action: "editorial-review-after-revision",
            createdAt: "2026-08-07T00:02:00Z",
            details: {
              telemetry: telemetry({
                totalScore: 56,
                convergence: lockConvergence(-29, 4),
              }),
            },
          },
          {
            action: "revision-remediation-exhausted",
            createdAt: "2026-08-07T00:03:00Z",
            details: {
              telemetry: telemetry({
                totalScore: null,
                result: "exhausted",
                convergence: {
                  observation: "rewrite",
                  lockEnabled: true,
                  bestRetainedAtExhaustion: true,
                },
              }),
            },
          },
        ],
      },
      {
        workflowState: "MAJOR_REVISION_REQUIRED",
        transitions: [
          {
            action: "editorial-review-after-revision",
            createdAt: "2026-08-07T01:00:00Z",
            details: { telemetry: telemetry({ totalScore: 40 }) },
          },
        ],
      },
    ]);

    expect(metrics.denominators).toMatchObject({
      lockCandidateComparisons: 2,
      rejectedCandidateRetentionComparisons: 2,
      rejectedScoreDeltaCount: 2,
      exhaustionBestRetentionComparisons: 1,
    });
    expect(metrics.candidateLock).toEqual({
      candidateRegressionRate: 1,
      rejectedRegressionCount: 2,
      retainedBestRate: 1,
      averageRejectedScoreDelta: -25.5,
      exhaustionWithBestRetainedRate: 1,
    });
  });

  it("reports RC1 guard, brake, revision and version dimensions", () => {
    const metrics = aggregateRemediationMetrics([
      {
        workflowState: "PUBLISH_READY",
        transitions: [
          {
            action: "remediate-required-revision",
            createdAt: "2026-08-07T00:00:00Z",
            details: {
              telemetry: telemetry({
                aiTfesVersion: "v2-rc1",
                result: "retry",
              }),
            },
          },
          {
            action: "final-verification",
            success: true,
            createdAt: "2026-08-07T00:01:00Z",
            details: {
              telemetry: telemetry({
                aiTfesVersion: "v2-rc1",
                finalMinorGuard: {
                  finalMinorGuardEligible: true,
                  finalMinorSuppressed: true,
                  finalMinorReasonClass: "craft-only",
                  guardEnabled: true,
                },
              }),
            },
          },
          {
            action: "human-polish",
            createdAt: "2026-08-07T00:02:00Z",
            details: {
              telemetry: telemetry({ aiTfesVersion: "v2-rc1" }),
            },
          },
        ],
      },
      {
        workflowState: "MAJOR_REVISION_REQUIRED",
        transitions: [
          {
            action: "remediate-required-revision",
            createdAt: "2026-08-07T01:00:00Z",
            details: {
              telemetry: telemetry({
                aiTfesVersion: "v2-rc1",
                result: "retry",
              }),
            },
          },
          {
            action: "editorial-review-after-revision",
            createdAt: "2026-08-07T01:01:00Z",
            details: {
              telemetry: telemetry({
                aiTfesVersion: "v2-rc1",
                autoAckBrake: {
                  brakeEnabled: true,
                  autoAckEligible: true,
                  autoAckSuppressedForRegression: true,
                  humanBrakeTriggered: true,
                },
              }),
            },
          },
          {
            action: "human-review-confirmed",
            createdAt: "2026-08-07T01:02:00Z",
            details: {
              telemetry: telemetry({ aiTfesVersion: "v2-rc1" }),
            },
          },
        ],
      },
      {
        workflowState: "REWRITE_REQUIRED",
        transitions: [
          {
            action: "revision-remediation-exhausted",
            createdAt: "2026-08-07T02:00:00Z",
            details: {
              telemetry: telemetry({
                aiTfesVersion: "v1.6",
                result: "exhausted",
              }),
            },
          },
          {
            action: "manual-draft-revision",
            createdAt: "2026-08-07T02:01:00Z",
            details: {
              telemetry: telemetry({ aiTfesVersion: "v1.6" }),
            },
          },
        ],
      },
    ]);

    expect(metrics.finalMinorGuard).toEqual({
      falseFinalMinorEligibleRate: 1,
      suppressedFinalMinorRate: 1,
      postSuppressionPublishOrLockRate: 1,
      laterHumanCorrectionRate: 1,
    });
    expect(metrics.regressionAutoAckBrake).toEqual({
      suppressionRate: 1,
      regressionLoopsInterruptedRate: 1,
      humanInterventionAfterBrakeRate: 1,
      completionAfterBrakeRate: 0,
    });
    expect(metrics.revisionConvergenceRate).toBe(0.5);
    expect(metrics.manualRecoveryRate).toBe(1);
    expect(metrics.aiTfesVersionEvents).toEqual({
      "v1.6": 2,
      "v2-rc1": 6,
      "v2-rc2": 0,
      unknown: 0,
    });
  });

  it("does not compare Final against a stale Editorial score after Fact remediation rewrites", () => {
    const metrics = aggregateRemediationMetrics([
      {
        workflowState: "MINOR_REVISION_REQUIRED",
        transitions: [
          {
            action: "editorial-review",
            createdAt: "2026-08-07T00:00:00Z",
            details: { telemetry: telemetry({ totalScore: 88 }) },
          },
          {
            action: "remediate-fact-check",
            createdAt: "2026-08-07T00:01:00Z",
            details: { telemetry: telemetry({ totalScore: null, result: "retry" }) },
          },
          {
            action: "final-verification",
            createdAt: "2026-08-07T00:02:00Z",
            details: { telemetry: telemetry({ totalScore: 80, result: "fail" }) },
          },
        ],
      },
    ]);

    expect(metrics.denominators.finalScoreComparisons).toBe(0);
    expect(metrics.convergence.finalRegressionRate).toBeNull();
    expect(metrics.convergence.averageFinalScoreDelta).toBeNull();
  });

  it("aggregates prompt architecture versions and context reduction by prompt id", () => {
    const metrics = aggregateRemediationMetrics([
      {
        workflowState: "FINAL_REVIEWED",
        transitions: [
          {
            action: "editorial-review",
            createdAt: "2026-08-07T00:00:00Z",
            details: {
              telemetry: telemetry({
                prompt: {
                  promptId: "editorial-diagnosis",
                  promptArchitectureVersion: "2.0",
                  contextCharacterLength: 12_000,
                  legacyContextCharacterLength: 16_000,
                  contextReductionRatio: 0.25,
                  inputTokenEstimate: 3_000,
                  malformedOutput: false,
                },
              }),
            },
          },
          {
            action: "final-verification",
            createdAt: "2026-08-07T00:01:00Z",
            details: {
              telemetry: telemetry({
                prompt: {
                  promptId: "lock-verifier",
                  promptArchitectureVersion: "2.0",
                  contextCharacterLength: 8_000,
                  legacyContextCharacterLength: 24_000,
                  contextReductionRatio: 0.6667,
                  inputTokenEstimate: 2_000,
                  malformedOutput: true,
                },
              }),
            },
          },
        ],
      },
    ]);

    expect(metrics.promptArchitectureVersionEvents).toEqual({
      "1.6": 0,
      "2.0": 2,
      unknown: 0,
    });
    expect(metrics.promptContextById["editorial-diagnosis"]).toMatchObject({
      events: 1,
      averageContextChars: 12_000,
      averageLegacyContextChars: 16_000,
      averageContextReductionRatio: 0.25,
      malformedRate: 0,
    });
    expect(metrics.promptContextById["lock-verifier"]).toMatchObject({
      averageInputTokenEstimate: 2_000,
      malformedRate: 1,
    });
  });
});
