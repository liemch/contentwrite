import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRemediationTelemetry } from "@/lib/tfes/remediation-telemetry";

describe("WP2.7 remediation telemetry", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serializes the allowlisted gate, score, timing and draft-shape fields", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "a".repeat(40));
    const telemetry = buildRemediationTelemetry({
      articleId: "article-1",
      workflowState: "MINOR_REVISION_REQUIRED",
      transitionName: "editorial-review",
      draft: "# Title\n## Key Takeaways\nA\n## Discussion\nB\n## References\nC",
      result: "fail",
      attempt: 1,
      gateFailCount: 2,
      gateFailures: ["G2", "G8", "N1", "G8"],
      failureReasons: ["Thiếu evidence"],
      totalScore: 83,
      machineReadable: true,
      machineContract: "canonical",
      decision: "MINOR_REVISION_REQUIRED",
      maxTokens: 2200,
      llmMs: 1234,
      errorClass: "content",
      lifetimeRemediationCount: 4,
      cycleRemediationCount: 1,
      convergence: {
        observation: "editorial",
        currentScore: 83,
        previousEditorialScore: 85,
        scoreDelta: -2,
        scoreDirection: "declined",
        candidateRegression: true,
        finalRegression: null,
        retryConverging: false,
        rewriteCount: 1,
      },
    });

    expect(telemetry).toMatchObject({
      articleId: "article-1",
      gateFailures: ["G2", "G8"],
      totalScore: 83,
      hasKeyTakeaways: true,
      hasDiscussion: true,
      hasReferences: true,
      deploymentVersion: "a".repeat(40),
      aiTfesVersion: "v1.6",
      aiTfesConfig: {
        bestCandidateLock: false,
        falseFinalMinorGuard: false,
        minorPreservePrompt: false,
        regressionAutoAckBrake: false,
      },
      lifetimeRemediationCount: 4,
      cycleRemediationCount: 1,
      remediationCount: 1,
      convergence: {
        scoreDelta: -2,
        candidateRegression: true,
        rewriteCount: 1,
      },
    });
  });

  it("redacts secret-like values and never accepts prompt/article fields", () => {
    const telemetry = buildRemediationTelemetry({
      articleId: "article-2",
      workflowState: "FACT_CHECK_FAILED",
      transitionName: "workflow-step-error",
      draft: "",
      result: "error",
      failureReasons: [
        "Authorization: Bearer-super-secret",
        "api_key=sk-live-value",
      ],
      errorClass: "runtime",
    });
    const serialized = JSON.stringify(telemetry);

    expect(serialized).not.toContain("Bearer-super-secret");
    expect(serialized).not.toContain("sk-live-value");
    expect(serialized).not.toContain("fullPrompt");
    expect(serialized).not.toContain("systemPrompt");
  });
});
