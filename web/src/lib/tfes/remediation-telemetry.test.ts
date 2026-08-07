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
        promptArchitecture: false,
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

  it("serializes prompt registry metadata and context estimates only", () => {
    const telemetry = buildRemediationTelemetry({
      articleId: "article-prompt-v2",
      workflowState: "EDITORIAL_REVIEWED",
      transitionName: "editorial-review",
      draft: "# Private article body",
      result: "pass",
      prompt: {
        promptId: "editorial-diagnosis",
        promptVersion: "2.0",
        contractVersion: "editorial-diagnosis.v2",
        role: "DIAGNOSE",
        source: "src/lib/tfes/prompts-v2.ts",
        promptArchitectureVersion: "2.0",
        contextCharacterLength: 12_000,
        legacyContextCharacterLength: 16_000,
        contextReductionCharacters: 4_000,
        contextReductionRatio: 0.25,
        inputTokenEstimate: 3_000,
        defectCount: 0,
      },
    });
    expect(telemetry.prompt).toMatchObject({
      promptId: "editorial-diagnosis",
      promptVersion: "2.0",
      inputTokenEstimate: 3_000,
      defectCount: 0,
    });
    expect(JSON.stringify(telemetry.prompt)).not.toContain("Private article body");
  });
});
