import { describe, expect, it } from "vitest";
import { WorkflowState } from "@/generated/prisma/enums";
import { finalizePhaseOf } from "@/lib/tfes/finalize-phase";
import {
  HUMAN_REVIEW_DONE_MARK,
  REVIEW_DONE_MARK,
} from "@/lib/tfes/parser";

/** Knowledge record after Editorial Review passed and human ack (auto-ack post-revision). */
const reviewedKnowledge = `# Review\nScore 88\n${REVIEW_DONE_MARK}\n${HUMAN_REVIEW_DONE_MARK}`;

const factLedger = [
  "| C-1 | Claim about latency | Fact | src | https://example.com | Unsupported | fix |",
  "Verification Status: FAILED",
].join("\n");

describe("Fact Check loop routing", () => {
  it("runs Fact Check after Editorial Review passes", () => {
    expect(
      finalizePhaseOf({
        knowledgeRecord: reviewedKnowledge,
        factCheck: null,
        workflowState: WorkflowState.EDITORIAL_REVIEWED,
      }),
    ).toBe("fact");
  });

  it("routes to fact remediation only from FACT_CHECK_FAILED", () => {
    expect(
      finalizePhaseOf({
        knowledgeRecord: reviewedKnowledge,
        factCheck: factLedger,
        workflowState: WorkflowState.FACT_CHECK_FAILED,
      }),
    ).toBe("fact-remediate");
  });

  it("alternates remediation and validation: no two remediations without a Fact Check between", () => {
    // Mirrors the persisted article patches of each transition, in order.
    const afterFactCheckFail = {
      knowledgeRecord: reviewedKnowledge,
      factCheck: factLedger,
      workflowState: WorkflowState.FACT_CHECK_FAILED,
    };
    // remediate-fact-check writes factCheck: null and returns to EDITORIAL_REVIEWED.
    const afterRemediation = {
      knowledgeRecord: reviewedKnowledge,
      factCheck: null,
      workflowState: WorkflowState.EDITORIAL_REVIEWED,
    };

    expect(finalizePhaseOf(afterFactCheckFail)).toBe("fact-remediate");
    expect(finalizePhaseOf(afterRemediation)).toBe("fact");
    // Second loop behaves identically, so remediation can never repeat back-to-back.
    expect(finalizePhaseOf(afterFactCheckFail)).toBe("fact-remediate");
    expect(finalizePhaseOf(afterRemediation)).toBe("fact");
  });

  it("moves to final verification once Fact Check passes", () => {
    expect(
      finalizePhaseOf({
        knowledgeRecord: reviewedKnowledge,
        factCheck: "Verification Status: PASSED",
        workflowState: WorkflowState.FACT_CHECKED,
      }),
    ).toBe("final-verify");
  });

  it("still pauses for human review before the first Fact Check", () => {
    expect(
      finalizePhaseOf({
        knowledgeRecord: `# Review\n${REVIEW_DONE_MARK}`,
        factCheck: null,
        workflowState: WorkflowState.EDITORIAL_REVIEWED,
      }),
    ).toBe("await-human");
  });
});
