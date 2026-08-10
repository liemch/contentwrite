import { describe, expect, it } from "vitest";
import {
  buildVoiceReferenceBlock,
  getSystemPromptForRole,
} from "@/lib/tfes/prompts";
import {
  enforceCentralClaimLedgerRules,
  materializeReaderAudit,
  parseInsightPlanLockV2,
  READER_AUDIT_MARKER,
} from "@/lib/tfes/prompts-v2";

describe("prompt quality waves W2–W4 helpers", () => {
  it("role envelopes stay slim except GENERATE", () => {
    const research = getSystemPromptForRole("engineering", "RESEARCH");
    const generate = getSystemPromptForRole("engineering", "GENERATE");
    expect(research).toContain("ROLE=RESEARCH");
    expect(research).toContain("Never plan, draft, score");
    expect(generate.length).toBeGreaterThan(research.length);
    expect(generate).toMatch(/CẤM|anti-generic|gold_samples|DOMAIN PROFILE/i);
  });

  it("insight lock parser materializes Vietnamese gate/decision/planning labels", () => {
    const parsed = parseInsightPlanLockV2(`INSIGHT_PLAN_LOCK_JSON:
${JSON.stringify({
  contractVersion: "insight-plan-lock.v2",
  thesis: "Retry storms hide queue debt",
  insightLevel: "L2",
  tests: { soWhat: "PASS", nonObvious: "PASS", counterArgument: "PASS" },
  audience: "SRE leads",
  category: "Ops",
  angle: "Queue debt",
  reason: "evergreen ops learning",
  editorialRisk: "none",
  objective: "Teach bounded retries",
  counterPosition: "Always retry",
  applicationBoundary: "Not for idempotent POSTs",
  shapeId: "postmortem-lite",
  outline: ["Hook", "Mechanism", "Guardrail"],
  keyInsights: ["Retries amplify backlog"],
  status: "LOCKED",
})}
`);
    expect(parsed?.status).toBe("LOCKED");
    expect(parsed?.markdown).toContain("Luận điểm trung tâm");
    expect(parsed?.markdown).toContain("Góc chốt");
    expect(parsed?.markdown).toContain("Story Flow");
  });

  it("central claim rules block fake PASSED ledgers", () => {
    const enforced = enforceCentralClaimLedgerRules({
      contractVersion: "claim-ledger.v2",
      verificationStatus: "PASSED",
      claims: [
        {
          id: "C-001",
          claim: "Latency fell 40 percent after the change",
          kind: "Fact",
          importance: "CENTRAL",
          verdict: "Unsupported",
        },
      ],
    });
    expect(enforced.verificationStatus).not.toBe("PASSED");
    expect(enforced.centralClaimCount).toBe(1);
  });

  it("reader audit materializes KẾT LUẬN labels from JSON", () => {
    const out = materializeReaderAudit(`${READER_AUDIT_MARKER}
${JSON.stringify({
  contractVersion: "reader-audit.v2",
  findings: [
    {
      role: "Tech Lead",
      action: "KEEP",
      location: "opener",
      issue: "none",
      suggestedPolish: "",
    },
  ],
  checklist: {
    hook: "PASS",
    blogVoice: "PASS",
    concreteExample: "PASS",
    repetition: "PASS",
    seniorInsight: "PASS",
    templateSameness: "PASS",
  },
  conclusion: "PASS",
  polishActions: [],
})}
`);
    expect(out).toContain("KẾT LUẬN: ĐẠT");
  });

  it("voice reference is optional and never throws", () => {
    expect(() => buildVoiceReferenceBlock("engineering")).not.toThrow();
  });
});
