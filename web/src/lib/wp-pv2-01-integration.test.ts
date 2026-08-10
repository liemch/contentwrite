import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateCandidateLock } from "@/lib/tfes/best-candidate-lock";
import { inspectEditorialReview } from "@/lib/tfes/editorial-review-gate";
import { inspectFinalVerification } from "@/lib/tfes/final-verification";
import {
  buildMinorRemediationContextV2,
  buildMinorRemediationPromptV2,
} from "@/lib/tfes/prompts-v2";

const workflowSource = readFileSync(
  new URL("./tfes/workflow.ts", import.meta.url),
  "utf8",
);

const factPassed = [
  "| Claim ID | Vị trí | Claim | Loại | Mức quan trọng | Nguồn đã đọc | Evidence excerpt | Ngày | Verdict | Confidence | Xử lý |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  "| C-001 | Intro | Supported claim | Fact | Central | https://example.com | excerpt | 2026 | Supported | High | keep |",
  "VERIFICATION_STATUS: PASSED",
].join("\n");

describe("WP-PV2-01 full prompt architecture integration invariants", () => {
  it("wires every pipeline LLM call through the versioned registry", () => {
    expect(workflowSource).toContain(
      'resolvePromptDescriptor("editorial-diagnosis")',
    );
    expect(workflowSource).toContain("research-packet");
    expect(workflowSource).toContain("fact-audit");
    expect(workflowSource).toContain("fact-remediation");
    expect(workflowSource).toContain("insight-lock");
    expect(workflowSource).toContain("draft-generation");
    expect(workflowSource).toContain("insight-gate");
    expect(workflowSource).toContain("editorial-decision");
    expect(workflowSource).toContain("publish-renderer");
    expect(workflowSource).toContain("publish-polish");
    expect(workflowSource).toContain("publish-expansion");
    expect(workflowSource).toContain("publish-quality-repair");
    expect(workflowSource).toContain("hero-brief");
    expect(workflowSource).toContain("reader-audit");
    expect(workflowSource).toContain("human-polish");
    expect(workflowSource).toContain("buildResearchPacketPromptV2");
    expect(workflowSource).toContain("buildInsightGatePromptV2");
    expect(workflowSource).toContain("buildEditorialDecisionPromptV2");
    expect(workflowSource).toContain("buildInsightLockPromptV2");
    expect(workflowSource).toContain("buildDraftGenerationPromptV2");
    expect(workflowSource).toContain("buildFactAuditPromptV2");
    expect(workflowSource).toContain("buildFactRemediationPromptV2");
    expect(workflowSource).toContain("buildPublishRendererPromptV2");
    expect(workflowSource).toContain("buildReaderAuditPromptV2");
    expect(workflowSource).toContain("researchPacketCoverageInsufficient");
    expect(workflowSource).toContain("resolvePatchedOrFullDraft");
    expect(workflowSource).toContain("insightConsolidate");
    expect(workflowSource).toContain("parseInsightPlanLockV2");
    expect(workflowSource).toContain("materializeReaderAudit");
    expect(workflowSource).toContain("materializeFactLedger");
    expect(workflowSource).toContain("materializeResearchBrief");
    expect(workflowSource).toContain('resolvePromptDescriptor("lock-verifier")');
    expect(workflowSource).toContain("buildLockFormatRepairPromptV2");
    expect(workflowSource).toContain('buildPipelinePrompt("finalize-verify"');
    expect(workflowSource).toContain('"finalize-revision-remediate"');
  });

  it("85 Editorial PASS + Fact PASS + craft-only Lock note does not start rewrite", () => {
    const editorial = inspectEditorialReview(
      `EDITORIAL_DIAGNOSIS_JSON:
${JSON.stringify({
  contractVersion: "editorial-diagnosis.v2",
  totalScore: 85,
  insightScore: 22,
  gates: Array.from({ length: 8 }, (_, index) => ({
    id: `G${index + 1}`,
    status: "PASSED",
  })),
  decision: "EDITORIAL_REVIEWED",
  defects: [],
  requiredActions: [],
})}`,
    );
    const lock = inspectFinalVerification(
      `LOCK_DECISION_JSON:
${JSON.stringify({
  contractVersion: "lock-decision.v2",
  lockDecision: "LOCKED",
  factLockStatus: "PASSED",
  insightFloorStatus: "PASSED",
  blockingResiduals: [],
  openRequiredActions: [],
  unresolvedDefectIds: [],
  regressionDetected: false,
  optionalPolishActions: ["Polish one transition later"],
})}`,
      factPassed,
    );
    expect(editorial.resolvedState).toBe("EDITORIAL_REVIEWED");
    expect(lock.publishReady).toBe(true);
    expect(lock.lockDecision).toBe("LOCKED");
    expect(lock.decision).toBe("FINAL_REVIEWED");
  });

  it("real MINOR uses preserve semantics while Candidate Lock rejects a 85→63 regression", () => {
    const draft =
      "# Stable title\n\n## Introduction\nKeep\n\n## Deep Analysis\nFix locally\n\n## References\nKeep";
    const context = buildMinorRemediationContextV2({
      defects: [
        {
          defectId: "D-1",
          type: "CRAFT_LOCAL",
          severity: "MINOR",
          location: { sectionId: "deep-analysis" },
          diagnosis: "Local repetition",
          requiredOutcome: "Remove repetition",
          allowedMutations: ["deep-analysis"],
          evidenceRefs: [],
          blocking: false,
        },
      ],
      requiredActions: ["Close D-1"],
      fallbackFeedback: "",
      draft,
      evidenceSummary: { verdict: "PASSED" },
      maxDraftChars: 16_000,
    });
    expect(buildMinorRemediationPromptV2(context.context)).toContain(
      "ARTICLE_PATCH_JSON:",
    );
    expect(
      evaluateCandidateLock({
        config: { enabled: true, epsilon: 0 },
        machineReadable: true,
        bestBefore: {
          draftRevision: 1,
          editorialScore: 85,
          gateFailCount: 0,
          decision: "EDITORIAL_REVIEWED",
          workflowVersion: 1,
          reviewedAt: "2026-08-07T00:00:00.000Z",
          cycleId: "cycle-1",
          cycleAnchorAction: null,
          deploymentVersion: "test",
        },
        candidate: {
          draftRevision: 2,
          editorialScore: 63,
          gateFailCount: 1,
          decision: "MAJOR_REVISION_REQUIRED",
          workflowVersion: 2,
          reviewedAt: "2026-08-07T00:01:00.000Z",
          cycleId: "cycle-1",
          cycleAnchorAction: null,
          deploymentVersion: "test",
        },
      }),
    ).toMatchObject({
      candidateRegression: true,
      candidateRejected: true,
      bestAfter: { editorialScore: 85 },
    });
  });
});

