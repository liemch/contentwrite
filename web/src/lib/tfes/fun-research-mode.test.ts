import { describe, expect, it } from "vitest";
import { researchModeForDomain } from "@/lib/tfes/domains";
import { auditResearchEvidence } from "@/lib/tfes/research-evidence";
import {
  buildObservationResearchPromptV2,
  materializeResearchBrief,
} from "@/lib/tfes/prompts-v2";
import { editorialSelfCheck } from "@/lib/tfes/quality";

describe("Fun researchMode=observation", () => {
  it("chỉ fun dùng observation; engineering vẫn full", () => {
    expect(researchModeForDomain("fun")).toBe("observation");
    expect(researchModeForDomain("engineering")).toBe("full");
    expect(researchModeForDomain("lifestyle")).toBe("full");
  });

  it("observation audit không bắt URL khi có findings + twist", () => {
    const brief = `# Research Brief

## Sources
- (Observation mode — không web search)

## Different Perspectives / Cross-validation
- Khi nào không vui: chế giễu người đuổi trend muộn

## Findings / Trade-offs
- Format chết sớm vì mệt bắt chước
- Algorithm thưởng drama hơn chất lượng
- Authentic trên stream vẫn là performance

## Insights
- Twist: khán giả cười vì biết đang diễn
`;
    const audit = auditResearchEvidence(brief, "observation");
    expect(audit.passed).toBe(true);
    expect(audit.mode).toBe("observation");
    expect(audit.urls).toHaveLength(0);
  });

  it("full audit vẫn fail khi không có URL", () => {
    const audit = auditResearchEvidence("## Findings\n- a\n- b\n- c\nphản biện", "full");
    expect(audit.passed).toBe(false);
    expect(audit.issues.some((i) => /lineage/i.test(i))).toBe(true);
  });

  it("observation prompt cấm bịa URL", () => {
    const prompt = buildObservationResearchPromptV2("TOPIC:\ntest");
    expect(prompt).toContain("sources and evidence arrays MUST be empty");
    expect(prompt).toContain("never invent URLs");
  });

  it("materialize brief không URL vẫn đọc được", () => {
    const raw = `RESEARCH_PACKET_JSON:
{"contractVersion":"research-packet.v2","topic":"meme","coverageStatus":"SUFFICIENT","sources":[],"evidence":[],"contradictions":["Khi chế nhạo người còn dùng format cũ thì không công bằng"],"findings":["Format chết sớm","Algorithm thưởng drama","Authentic vẫn là show"],"insightCandidates":["Khán giả cười vì biết đang diễn"],"limitations":["No web search"]}`;
    const brief = materializeResearchBrief(raw);
    expect(brief).toContain("Observation mode");
    expect(brief).toContain("Format chết sớm");
    expect(brief).not.toMatch(/https?:\/\//);
  });

  it("editorialSelfCheck không bắt SOURCES với domain fun", () => {
    const issues = editorialSelfCheck({
      domain: "fun",
      researchBrief: "# Research Brief\nObservation only",
      insightGate: "L2 thesis ".repeat(20),
      draft12: "khi nào không nên ".repeat(40) + "pipeline stage retry ".repeat(20),
      cleanPublish: "# Title\n\n*sub*\n\n![x](HERO_IMAGE)\n\n" + "câu dài đủ từ. ".repeat(80),
      factCheck: "PASSED ledger ".repeat(10),
      writingPrefs: { targetWordCount: 200, avoidFormatsText: "table" },
      publishFormat: "facebook",
    });
    expect(issues.find((i) => i.code === "SOURCES")).toBeUndefined();
  });
});
