import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("WP-QF Phase C wiring", () => {
  it("QF-01: publish prefers best locked draft before finalize-b regenerate", () => {
    const workflow = source("src/lib/tfes/workflow.ts");
    expect(workflow).toContain("WP-QF-01");
    expect(workflow).toContain("publishDerivedFromBest");
    expect(workflow).toContain("toReaderCleanPublish");
    const publishBlock = workflow.slice(workflow.indexOf("WP-QF-01"));
    expect(publishBlock.indexOf("publishDerivedFromBest")).toBeLessThan(
      publishBlock.indexOf('"finalize-b"'),
    );
  });

  it("QF-02: fact and reader-sim use raised clip helpers", () => {
    const workflow = source("src/lib/tfes/workflow.ts");
    expect(workflow).toContain("factDraftClipChars");
    expect(workflow).toContain("readerSimClipChars");
    expect(PIPELINE_CONFIG.context.readerSimDraftMinChars).toBeGreaterThanOrEqual(
      12_000,
    );
    expect(PIPELINE_CONFIG.context.reviewDraftMinChars).toBeGreaterThanOrEqual(
      16_000,
    );
  });

  it("QF-03: MAJOR/REWRITE get severity directives; MINOR alone uses v2 preserve", () => {
    const workflow = source("src/lib/tfes/workflow.ts");
    expect(workflow).toContain("## REWRITE MODE");
    expect(workflow).toContain("## MAJOR MODE");
    expect(workflow).toContain("WP-QF-03");
    const prompts = source("src/lib/tfes/prompts.ts");
    expect(prompts).toContain("MAJOR: được phép viết lại");
    expect(prompts).toContain("REWRITE: viết lại cấu trúc");
  });

  it("QF-04: Final MINOR guard receives lock-v2 residuals", () => {
    const workflow = source("src/lib/tfes/workflow.ts");
    expect(workflow).toContain("lockResiduals");
    expect(workflow).toContain("blockingResiduals");
    const guard = source("src/lib/tfes/final-minor-guard.ts");
    expect(guard).toContain('machineContract === "lock-v2"');
  });

  it("QF-05: write/publish ban reader-facing L2 jargon; Insight Gate keeps L0–L3", () => {
    const prompts = source("src/lib/tfes/prompts.ts");
    expect(prompts).toContain("CẤM mọi jargon pipeline");
    expect(prompts).toContain('Không viết meta biên tập / jargon pipeline vào body');
    expect(prompts).toContain("Xếp hạng L0–L3");
    expect(prompts).toMatch(/Insight Gate đạt/);
  });

  it("QF-06: score floors stay at contract defaults (no blind cut)", () => {
    const contract = source("src/lib/tfes/contract.ts");
    expect(contract).toContain("minimumTotalScore: 85");
    expect(contract).toContain("minimumTotalScore: 90");
    expect(contract).toContain("minimumInsightScore: 22");
  });
});
