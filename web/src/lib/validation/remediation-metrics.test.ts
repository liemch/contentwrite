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
});
