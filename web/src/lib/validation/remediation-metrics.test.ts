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
});
