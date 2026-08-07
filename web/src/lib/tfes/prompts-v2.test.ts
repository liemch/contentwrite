import { describe, expect, it } from "vitest";
import {
  buildEditorialDiagnosisContextV2,
  buildEditorialDiagnosisPromptV2,
  buildLockVerifierContextV2,
  buildLockVerifierPromptV2,
  buildMinorRemediationContextV2,
  buildMinorRemediationPromptV2,
  type EditorialDefectV2,
} from "@/lib/tfes/prompts-v2";

const draft = `# Stable title

## Introduction
Stable opening.

## Deep Analysis
Repeated wording that needs a local edit.

## Recommendations
Stable recommendation.

## References
https://example.com/source`;

const minorDefect: EditorialDefectV2 = {
  defectId: "D-1",
  type: "CRAFT_LOCAL",
  severity: "MINOR",
  location: { sectionId: "deep-analysis" },
  diagnosis: "Repeated wording",
  requiredOutcome: "Remove the repetition",
  allowedMutations: ["deep-analysis"],
  evidenceRefs: [],
  blocking: false,
};

describe("Prompt Architecture v2 prompt trio", () => {
  it("Editorial v2 is diagnose-only and uses the narrow context map", () => {
    const context = buildEditorialDiagnosisContextV2({
      insightPlan: "Thesis lock",
      draft,
      articleShape: "Shape: analytical",
      maxDraftChars: 16_000,
    });
    const prompt = buildEditorialDiagnosisPromptV2(context);
    expect(prompt).toContain("ROLE: DIAGNOSE");
    expect(prompt).toContain("EDITORIAL_DIAGNOSIS_JSON:");
    expect(prompt).toContain('"defects": []');
    expect(prompt).toContain("Do not rewrite");
    expect(prompt).not.toContain("Research Brief");
    expect(prompt).not.toContain("Chỉ xuất toàn bộ bản nháp");
  });

  it("MINOR v2 preserves unrelated sections and excludes legacy history dumps", () => {
    const built = buildMinorRemediationContextV2({
      defects: [minorDefect],
      requiredActions: ["Remove the repetition"],
      fallbackFeedback: "legacy fallback",
      draft,
      evidenceSummary: { verdict: "PASSED" },
      maxDraftChars: 16_000,
    });
    const prompt = buildMinorRemediationPromptV2(built.context);
    expect(built.targetSectionIds).toEqual(["deep-analysis"]);
    expect(built.preserveSectionIds).toContain("title");
    expect(built.preserveSectionIds).toContain("recommendations");
    expect(prompt).toContain("minimum edit");
    expect(prompt).toContain("UNCHANGED_SECTIONS:");
    expect(prompt).toContain("CHANGED_SECTIONS:");
    expect(prompt).toContain("BASE_CANDIDATE_FULL_FOR_COMPATIBILITY");
    expect(prompt).not.toContain("Research Brief");
    expect(prompt).not.toContain("Knowledge Record");
    expect(prompt).not.toContain("Final Verification (pipeline)");
    expect(prompt).not.toContain("FINAL_TOTAL_SCORE:");
    expect(prompt).not.toContain("EDITORIAL_DECISION:");
  });

  it("Lock v2 verifies lock signals without a broad craft re-review", () => {
    const context = buildLockVerifierContextV2({
      editorialResult: { score: 85, passed: true, defects: [] },
      factSummary: { verdict: "PASSED", blockingClaimCount: 0 },
      blockingClaims: [],
      insightPlan: "Locked thesis",
      regressionSummary: { regression: false },
      candidateSignal: "Opening and thesis signal",
    });
    const prompt = buildLockVerifierPromptV2(context);
    expect(prompt).toContain("ROLE: LOCK");
    expect(prompt).toContain("LOCK_DECISION_JSON:");
    expect(prompt).toContain("Craft-only polish is optional");
    expect(prompt).toContain("lockDecision=LOCKED");
    expect(prompt).not.toContain("FINAL_TOTAL_SCORE");
    expect(prompt).not.toContain("write the revised article");
  });
});

