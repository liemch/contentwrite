import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("WP-V2-02 Best Candidate Lock wiring", () => {
  it("uses one deterministic config and controller without an LLM dependency", () => {
    const config = source("src/lib/tfes/pipeline-config.ts");
    expect(config).toContain("bestCandidateLock");
    expect(config).toContain("enabled: false");
    expect(config).toContain("epsilon: 0");

    const controller = source("src/lib/tfes/best-candidate-lock.ts");
    expect(controller).toContain("evaluateCandidateLock");
    expect(controller).not.toContain("chatCompletion");
    expect(controller).not.toContain("WorkflowState");
    expect(controller).not.toContain("prisma");
  });

  it("rejects reviewed regressions, promotes the best artifact, and protects exhaustion", () => {
    const workflow = source("src/lib/tfes/workflow.ts");
    expect(workflow).toContain("bestCandidateContextForRun");
    expect(workflow).toContain("lockEvaluation.candidateRejected");
    expect(workflow).toContain('reason: "review-rejected"');
    expect(workflow).toContain("activeArtifactRetainsBest");
    expect(workflow).toContain("bestRetainedAtExhaustion");
    expect(workflow).toContain("best-candidate-lock-artifact-missing");
    expect(workflow).toContain("factCheck: null");
    expect(workflow).toContain("cleanPublish: null");
    expect(workflow.indexOf("inspectEditorialReview(reviewOut)")).toBeLessThan(
      workflow.indexOf("evaluateCandidateLock({"),
    );
  });

  it("reports lock metrics only from lock-aware telemetry", () => {
    const metrics = source("scripts/lib/remediation-metrics.mjs");
    expect(metrics).toContain('typeof lock?.lockEnabled === "boolean"');
    expect(metrics).toContain("rejectedRegressionCount");
    expect(metrics).toContain("retainedBestRate");
    expect(metrics).toContain("averageRejectedScoreDelta");
    expect(metrics).toContain("exhaustionWithBestRetainedRate");
  });
});
