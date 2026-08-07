import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  evaluateCandidateLock,
  type BestCandidateReference,
} from "@/lib/tfes/best-candidate-lock";
import { evaluateFinalMinorGuard } from "@/lib/tfes/final-minor-guard";
import { minorPreserveInstructions } from "@/lib/tfes/minor-preserve-prompt";
import { evaluateRegressionAutoAckBrake } from "@/lib/tfes/regression-auto-ack-brake";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const best85: BestCandidateReference = {
  draftRevision: 1,
  editorialScore: 85,
  gateFailCount: 0,
  decision: "PASS",
  workflowVersion: 1,
  reviewedAt: "2026-08-07T00:00:00.000Z",
  cycleId: "human-review-confirmed:2026-08-07T00:00:01.000Z",
  cycleAnchorAction: "human-review-confirmed",
  deploymentVersion: "abc1234",
};

describe("AI-TFES v2 RC1 integration invariants", () => {
  it("suppresses the observed craft-only Final 85 MINOR and keeps candidate 85", () => {
    const guard = evaluateFinalMinorGuard({
      enabled: true,
      machineReadable: true,
      alreadyPublishReady: false,
      finalDecision: "MINOR_REVISION_REQUIRED",
      finalReview: "**Required Revisions:** polish wording and transition flow",
      finalScore: 85,
      finalInsightScore: 22,
      finalGatesPassed: true,
      factPassed: true,
      blockingClaims: 0,
      openActions: 0,
      editorialPassed: true,
      editorialScore: 85,
      editorialGateFailCount: 0,
      editorialThreshold: 85,
      insightFloor: 22,
    });
    expect(guard.suppressed).toBe(true);
    expect(best85.editorialScore).toBe(85);
  });

  it("keeps real blocking Final MINOR on the remediation path", () => {
    expect(
      evaluateFinalMinorGuard({
        enabled: true,
        machineReadable: true,
        alreadyPublishReady: false,
        finalDecision: "MINOR_REVISION_REQUIRED",
        finalReview:
          "**Required Revisions:** add missing source evidence for unsupported claim",
        finalScore: 85,
        finalInsightScore: 22,
        finalGatesPassed: true,
        factPassed: true,
        blockingClaims: 0,
        openActions: 0,
        editorialPassed: true,
        editorialScore: 85,
        editorialGateFailCount: 0,
        editorialThreshold: 85,
        insightFloor: 22,
      }).suppressed,
    ).toBe(false);
  });

  it("rejects 63, restores best 85, and brakes before a 56 loop", () => {
    const candidate63 = { ...best85, draftRevision: 2, editorialScore: 63 };
    const lock = evaluateCandidateLock({
      config: { enabled: true, epsilon: 0 },
      bestBefore: best85,
      candidate: candidate63,
      machineReadable: true,
    });
    const brake = evaluateRegressionAutoAckBrake({
      enabled: true,
      isPostRevisionReview: true,
      candidateEligible: lock.candidateEligible,
      candidateRegression: lock.candidateRegression,
      bestScore: lock.bestBefore?.editorialScore ?? null,
      candidateScore: candidate63.editorialScore,
      scoreDelta: lock.candidateScoreDelta,
      epsilon: lock.epsilon,
    });
    expect(lock).toMatchObject({
      candidateRejected: true,
      bestAfter: best85,
    });
    expect(brake).toMatchObject({
      suppressAutoAck: true,
      humanBrakeTriggered: true,
    });
  });

  it("keeps MINOR full-draft compatibility while adding preserve constraints", () => {
    const prompt = minorPreserveInstructions({
      enabled: true,
      revisionSeverity: "MINOR_REVISION_REQUIRED",
      version: "v2-rc1-minor-preserve-v1",
    });
    expect(prompt).toContain("full Article.md output contract");
    expect(prompt).toContain("minimum failing surface");
  });

  it("wires independent RC flags into only the required workflow branches", () => {
    const config = source("src/lib/tfes/pipeline-config.ts");
    for (const flag of [
      "bestCandidateLock",
      "falseFinalMinorGuard",
      "minorPreservePrompt",
      "regressionAutoAckBrake",
    ]) {
      expect(config).toContain(flag);
    }
    const workflow = source("src/lib/tfes/workflow.ts");
    expect(workflow).toContain("evaluateFinalMinorGuard");
    expect(workflow).toContain("effectivePublishReady");
    expect(workflow).toContain("minorPreserveInstructions");
    expect(workflow).toContain("evaluateRegressionAutoAckBrake");
    expect(workflow).toContain("withHumanReviewPendingMark(cleanReview)");
  });
});
