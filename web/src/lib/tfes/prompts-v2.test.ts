import { describe, expect, it } from "vitest";
import {
  buildCleanTransformContextV2,
  buildEditorialDecisionPromptV2,
  buildEditorialDiagnosisContextV2,
  buildEditorialDiagnosisPromptV2,
  buildHeroBriefPromptV2,
  buildHumanPolishPromptV2,
  buildInsightGatePromptV2,
  buildLockFormatRepairPromptV2,
  buildLockVerifierContextV2,
  buildLockVerifierPromptV2,
  buildMajorRemediationPromptV2,
  buildMinorRemediationContextV2,
  buildMinorRemediationPromptV2,
  buildPublishExpansionPromptV2,
  buildPublishPolishPromptV2,
  buildPublishQualityRepairPromptV2,
  buildPublishRendererPromptV2,
  buildReaderAuditPromptV2,
  buildRewriteRemediationPromptV2,
  materializeFactLedger,
  materializeResearchBrief,
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
    expect(prompt).toContain("ARTICLE_PATCH_JSON:");
    expect(prompt).toContain("article-patch.v1");
    expect(prompt).toContain("SECTION_HASHES:");
    expect(prompt).not.toContain("Research Brief");
    expect(prompt).not.toContain("Knowledge Record");
    expect(prompt).not.toContain("Final Verification (pipeline)");
    expect(prompt).not.toContain("FINAL_TOTAL_SCORE:");
    expect(prompt).not.toContain("EDITORIAL_DECISION:");
  });

  it("MINOR v2 without locatable defects does not freeze the whole draft", () => {
    const built = buildMinorRemediationContextV2({
      defects: [],
      requiredActions: ["Gate G2 FAILED: Evidence from low-tier sources"],
      fallbackFeedback: "legacy fallback",
      draft,
      evidenceSummary: { verdict: "PASSED" },
      maxDraftChars: 16_000,
    });

    expect(built.targetSectionIds).toEqual([]);
    expect(built.preserveSectionIds).toEqual([]);
    expect(built.context).toContain("Gate G2 FAILED");
    expect(built.context).toContain("unresolved");
    expect(built.context).not.toContain('"preserveSectionIds":["title"');
  });

  it("MAJOR and REWRITE v2 prompts allow structural repair without MINOR freeze language", () => {
    const major = buildMajorRemediationPromptV2("CONTEXT");
    const rewrite = buildRewriteRemediationPromptV2("CONTEXT");
    expect(major).toContain("PROMPT_ID: major-remediation");
    expect(major).toContain("article-patch.v1");
    expect(major).toContain("ARTICLE_PATCH_JSON:");
    expect(rewrite).toContain("PROMPT_ID: rewrite-remediation");
    expect(rewrite).toContain("Authorized rewrite");
    expect(rewrite).toContain("Do not salvage failing prose");
  });

  it("research-packet and fact-audit materialize compatible markdown", () => {
    const research = materializeResearchBrief(`RESEARCH_PACKET_JSON:
${JSON.stringify({
  contractVersion: "research-packet.v2",
  coverageStatus: "SUFFICIENT",
  sources: [
    {
      url: "https://example.com/a",
      tier: 2,
      accessed: "2026-08-01",
      title: "Source A",
    },
  ],
  findings: ["Conditional finding"],
  contradictions: ["Counter view"],
  limitations: ["Narrow sample"],
})}
`);
    expect(research).toContain("https://example.com/a");
    expect(research).toContain("Tier 2");
    expect(research).toContain("Accessed 2026-08-01");
    expect(research).toContain("Different Perspectives");

    const ledger = materializeFactLedger(`CLAIM_LEDGER_JSON:
${JSON.stringify({
  contractVersion: "claim-ledger.v2",
  verificationStatus: "PASSED",
  claims: [
    {
      id: "C-001",
      location: "Intro",
      claim: "A supported factual claim about X",
      kind: "Fact",
      importance: "CENTRAL",
      source: "https://example.com/a",
      excerpt: "excerpt",
      verdict: "Supported",
      confidence: "High",
      action: "keep",
    },
  ],
  blockingClaimIds: [],
})}
`);
    expect(ledger).toContain("VERIFICATION_STATUS: PASSED");
    expect(ledger).toContain("C-001");
    expect(ledger).toContain("Supported");
  });

  it("all remaining pipeline stages expose explicit v2 contracts", () => {
    const cleanContext = buildCleanTransformContextV2({
      topic: "Topic",
      source: draft,
      instruction: "Fix one issue",
    });
    const prompts = [
      buildInsightGatePromptV2("CONTEXT"),
      buildEditorialDecisionPromptV2("CONTEXT"),
      buildPublishRendererPromptV2(cleanContext),
      buildPublishPolishPromptV2(cleanContext),
      buildPublishExpansionPromptV2(cleanContext),
      buildPublishQualityRepairPromptV2(cleanContext),
      buildHumanPolishPromptV2(cleanContext),
      buildHeroBriefPromptV2("CONTEXT"),
      buildReaderAuditPromptV2("CONTEXT"),
    ];
    for (const prompt of prompts) {
      expect(prompt).toContain("VERSION: 2.0");
      expect(prompt).toContain("CONTRACT_VERSION:");
      expect(prompt).toContain("PROMPT_ID:");
    }
    expect(prompts[0]).toContain("KẾT LUẬN: ĐẠT ≥ L2");
    expect(prompts[1]).toContain("- Góc chốt:");
    expect(prompts[2]).toContain("=== BẢN SẠCH ĐỂ ĐĂNG ===");
    expect(prompts[5]).toContain("Change only what the");
    expect(prompts[6]).toContain("authoritative human edits");
    expect(prompts[7]).toContain("HERO IMAGE BRIEF");
    expect(prompts[8]).toContain("READER_AUDIT_JSON:");
    expect(prompts.join("\n")).not.toContain("AI-TFES v1.6");
  });

  it("Lock format repair re-emits contract without re-judging", () => {
    const repair = buildLockFormatRepairPromptV2({
      previousOutput: "lock should be LOCKED",
      malformedReason: "marker-missing",
    });
    expect(repair).toContain("ROLE: FORMAT_REPAIR");
    expect(repair).toContain("LOCK_DECISION_JSON:");
    expect(repair).toContain("Do NOT re-read the article");
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

