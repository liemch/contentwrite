import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EDITORIAL_REVIEW_MACHINE_KEYS,
  LEGACY_EDITORIAL_REVIEW_MACHINE_KEYS,
} from "@/lib/tfes/editorial-review-gate";
import { buildPipelinePrompt } from "@/lib/tfes/prompts";

const workflowSource = readFileSync(new URL("./workflow.ts", import.meta.url), "utf8");
const reviewTemplate = readFileSync(
  new URL("../../../content/ai-tfes/05-Templates/Review.md", import.meta.url),
  "utf8",
);

function section(start: string, end: string): string {
  const startIndex = workflowSource.indexOf(start);
  const endIndex = workflowSource.indexOf(end, startIndex + start.length);
  expect(startIndex, `missing start marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing end marker: ${end}`).toBeGreaterThan(startIndex);
  return workflowSource.slice(startIndex, endIndex);
}

describe("WP2.6 workflow wiring", () => {
  it("Editorial Review và Final Verification dùng chung context policy", () => {
    const editorial = section(
      'if (finPhase === "review")',
      "// Chờ người xác nhận AI Review",
    );
    const finalVerification = section(
      'if (finPhase === "final-verify")',
      "// Bước 10b: Polish",
    );

    expect(editorial).toContain("reviewDraftClipChars(article.targetWordCount)");
    expect(finalVerification).toContain(
      "reviewDraftClipChars(article.targetWordCount)",
    );
    expect(finalVerification).not.toMatch(
      /finalize-verify[\s\S]*clipText\(stripPipelineMarks\(article\.draft12\),\s*7_000\)/,
    );
  });

  it("Revision và Fact remediation dùng chung token policy", () => {
    const revision = section(
      'if (finPhase === "revision-remediate")',
      "// FACT_CHECK_FAILED",
    );
    const fact = section(
      'if (finPhase === "fact-remediate")',
      "// Bước 9: Fact Check",
    );

    for (const remediation of [revision, fact]) {
      expect(remediation).toContain(
        "const remediationMaxTokens = cleanGenMaxTokens(article.targetWordCount)",
      );
      expect(remediation).toContain("maxTokens: remediationMaxTokens");
    }
    expect(revision).not.toMatch(/maxTokens:\s*(?:5600|5_600)/);
    expect(fact).not.toMatch(/maxTokens:\s*(?:5200|5_200)/);
  });
});

describe("WP2.6 machine output contract", () => {
  it("prompt Editorial dùng canonical PROVISIONAL_* duy nhất", () => {
    const prompt = buildPipelinePrompt("finalize-review", "CONTEXT");
    for (const key of EDITORIAL_REVIEW_MACHINE_KEYS) {
      expect(prompt).toContain(`${key}:`);
    }
    expect(prompt).not.toContain("FINAL_TOTAL_SCORE:");
    expect(prompt).not.toContain("FINAL_INSIGHT_SCORE:");
    expect(prompt).not.toContain("FINAL_DECISION:");
  });

  it("prompt Final Verification chỉ dùng FINAL_*", () => {
    const prompt = buildPipelinePrompt("finalize-verify", "CONTEXT");
    expect(prompt).toContain("FINAL_TOTAL_SCORE:");
    expect(prompt).toContain("FINAL_INSIGHT_SCORE:");
    expect(prompt).toContain("FINAL_DECISION:");
    expect(prompt).not.toContain("PROVISIONAL_TOTAL_SCORE:");
    expect(prompt).not.toContain("PROVISIONAL_INSIGHT_SCORE:");
    expect(prompt).not.toContain("EDITORIAL_DECISION:");
  });

  it("template không khai báo lại key của hai phase", () => {
    const phaseSpecificKeys = new Set([
      ...EDITORIAL_REVIEW_MACHINE_KEYS,
      ...LEGACY_EDITORIAL_REVIEW_MACHINE_KEYS,
    ]);
    phaseSpecificKeys.delete("GATES_G1_G8");
    for (const key of phaseSpecificKeys) {
      expect(reviewTemplate).not.toContain(`${key}:`);
    }
    expect(reviewTemplate).toContain(
      "dùng **đúng block được prompt của phase yêu cầu**",
    );
  });
});
