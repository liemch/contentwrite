import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { WorkflowState } from "@/generated/prisma/client";
import { evaluateCandidateLock } from "@/lib/tfes/best-candidate-lock";
import { inspectEditorialReview } from "@/lib/tfes/editorial-review-gate";
import {
  countRemediationsInCurrentCycle,
  isRemediationBudgetExhausted,
} from "@/lib/tfes/remediation-budget";
import {
  MAX_EDITORIAL_REVIEW_FORMAT_RETRIES,
  MAX_REVISION_REMEDIATION_RETRIES,
} from "@/lib/tfes/retry-policy";
import {
  buildEditorialDiagnosisPromptV2,
  buildEditorialFormatRepairPromptV2,
} from "@/lib/tfes/prompts-v2";

const workflowSource = readFileSync(
  new URL("./workflow.ts", import.meta.url),
  "utf8",
);

const gates = (status: "PASSED" | "FAILED" = "PASSED") =>
  Array.from({ length: 8 }, (_, index) => ({
    id: `G${index + 1}`,
    status,
  }));

function diagnosis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: "editorial-diagnosis.v2",
    totalScore: 89,
    insightScore: 23,
    gates: gates(),
    decision: "EDITORIAL_REVIEWED",
    defects: [],
    requiredActions: [],
    ...overrides,
  };
}

function marked(payload: Record<string, unknown>): string {
  return `EDITORIAL_DIAGNOSIS_JSON:\n${JSON.stringify(payload)}`;
}

describe("Editorial v2 contract normalization", () => {
  it("1. parses a valid v2 diagnosis", () => {
    const result = inspectEditorialReview(marked(diagnosis()));
    expect(result).toMatchObject({
      machineReadable: true,
      parseFailure: false,
      machineContract: "v2",
      totalScore: 89,
      insightScore: 23,
      resolvedState: WorkflowState.EDITORIAL_REVIEWED,
      malformedReasonCode: null,
    });
  });

  it("2. parses JSON wrapped in a markdown fence", () => {
    const result = inspectEditorialReview(
      `EDITORIAL_DIAGNOSIS_JSON:\n\`\`\`json\n${JSON.stringify(diagnosis())}\n\`\`\``,
    );
    expect(result.machineReadable).toBe(true);
    expect(result.totalScore).toBe(89);
  });

  it("3. parses a JSON block wrapped in prose", () => {
    const result = inspectEditorialReview(
      [
        "Đánh giá tổng quan: bài đã đạt bar biên tập.",
        marked(diagnosis()),
        "Ghi chú thêm: có thể trau chuốt câu chữ sau.",
      ].join("\n\n"),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.decision).toBe("EDITORIAL_REVIEWED");
  });

  it("4. accepts numeric scores sent as strings", () => {
    const result = inspectEditorialReview(
      marked(diagnosis({ totalScore: "89", insightScore: "23/30" })),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.totalScore).toBe(89);
    expect(result.insightScore).toBe(23);
  });

  it("4b. accepts gate object maps and PASS/FAIL aliases", () => {
    const result = inspectEditorialReview(
      marked(
        diagnosis({
          gates: Object.fromEntries(
            Array.from({ length: 8 }, (_, index) => [`g${index + 1}`, "pass"]),
          ),
        }),
      ),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.gates).toHaveLength(8);
    expect(result.gateFailures).toEqual([]);
  });

  it("4c. salvages trailing commas and raw newlines inside strings", () => {
    const body = `EDITORIAL_DIAGNOSIS_JSON:
{
  "contractVersion": "editorial-diagnosis.v2",
  "totalScore": 86,
  "insightScore": 22,
  "gates": [${gates()
    .map((gate) => `{"id":"${gate.id}","status":"PASSED"}`)
    .join(",")}],
  "decision": "MINOR_REVISION_REQUIRED",
  "defects": [],
  "requiredActions": ["Sửa đoạn mở
tiếp tục dòng hai",],
}`;
    const result = inspectEditorialReview(body);
    expect(result.machineReadable).toBe(true);
    expect(result.totalScore).toBe(86);
    expect(result.requiredActions).toHaveLength(1);
  });

  it("5. tolerates missing optional fields", () => {
    const result = inspectEditorialReview(
      marked({
        contractVersion: "editorial-diagnosis.v2",
        totalScore: 88,
        insightScore: 22,
        gates: gates(),
        decision: "EDITORIAL_REVIEWED",
      }),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.defects).toEqual([]);
    expect(result.requiredActions).toEqual([]);
  });

  it("5b. keeps a complete diagnosis that omits contractVersion", () => {
    const payload = diagnosis();
    delete payload.contractVersion;
    const result = inspectEditorialReview(marked(payload));
    expect(result.machineContract).toBe("v2");
    expect(result.machineReadable).toBe(true);
  });

  it("6. ignores unknown harmless fields", () => {
    const result = inspectEditorialReview(
      marked(diagnosis({ futureField: { nested: true }, note: "ignored" })),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.totalScore).toBe(89);
  });

  it("7. rejects an invalid decision enum without inventing a verdict", () => {
    const result = inspectEditorialReview(
      marked(diagnosis({ decision: "NEEDS_HUMAN" })),
    );
    expect(result.parseFailure).toBe(true);
    expect(result.malformedReasonCode).toBe("missing-decision");
    expect(result.resolvedState).not.toBe(WorkflowState.REWRITE_REQUIRED);
  });

  it("7b. normalizes decision casing and spacing", () => {
    const result = inspectEditorialReview(
      marked(diagnosis({ decision: "minor revision required", totalScore: 86 })),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.decision).toBe("MINOR_REVISION_REQUIRED");
  });

  it("8. fails safe when the decision is missing entirely", () => {
    const payload = diagnosis();
    delete payload.decision;
    const result = inspectEditorialReview(marked(payload));
    expect(result.parseFailure).toBe(true);
    expect(result.malformedReasonCode).toBe("missing-decision");
  });

  it("8b. fails safe when gates are incomplete", () => {
    const result = inspectEditorialReview(
      marked(diagnosis({ gates: gates().slice(0, 5) })),
    );
    expect(result.parseFailure).toBe(true);
    expect(result.malformedReasonCode).toBe("gates-incomplete");
  });

  it("9. reports truncated JSON as a format defect", () => {
    const full = marked(diagnosis());
    const result = inspectEditorialReview(full.slice(0, full.length - 40));
    expect(result.parseFailure).toBe(true);
    expect(result.malformedReasonCode).toBe("json-truncated");
    expect(result.outputTruncated).toBe("known");
    expect(result.totalScore).toBeNull();
  });

  it("10. uses the last valid block when the model emits duplicates", () => {
    const result = inspectEditorialReview(
      [
        marked(diagnosis({ totalScore: 0, insightScore: 0 })),
        "Bản chấm thật:",
        marked(diagnosis({ totalScore: 91, insightScore: 24 })),
      ].join("\n\n"),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.totalScore).toBe(91);
  });

  it("15. treats an echoed 0 total as a placeholder, never REWRITE", () => {
    const result = inspectEditorialReview(
      marked(diagnosis({ totalScore: 0, insightScore: 22 })),
    );
    expect(result.parseFailure).toBe(true);
    expect(result.malformedReasonCode).toBe("placeholder-score");
    expect(result.totalScore).toBeNull();
    expect(result.resolvedState).not.toBe(WorkflowState.REWRITE_REQUIRED);
  });

  it("14. never exposes a score for unparseable output", () => {
    const result = inspectEditorialReview("Bài này ổn, có thể xuất bản.");
    expect(result.parseFailure).toBe(true);
    expect(result.machineContract).toBe("invalid");
    expect(result.totalScore).toBeNull();
    expect(result.insightScore).toBeNull();
    expect(result.decision).toBe("");
  });

  it("17. keeps v1.6 canonical and legacy contracts working", () => {
    const canonical = inspectEditorialReview(
      [
        "PROVISIONAL_TOTAL_SCORE: 90",
        "PROVISIONAL_INSIGHT_SCORE: 23",
        "GATES_G1_G8: PASSED",
        "EDITORIAL_DECISION: EDITORIAL_REVIEWED",
      ].join("\n"),
    );
    const legacy = inspectEditorialReview(
      [
        "FINAL_TOTAL_SCORE: 90/100",
        "FINAL_INSIGHT_SCORE: 23",
        "GATES_G1_G8: PASSED",
        "FINAL_DECISION: FINAL_REVIEWED",
      ].join("\n"),
    );
    expect(canonical).toMatchObject({
      machineContract: "canonical",
      machineReadable: true,
      resolvedState: WorkflowState.EDITORIAL_REVIEWED,
    });
    expect(legacy).toMatchObject({
      machineContract: "legacy",
      machineReadable: true,
      resolvedState: WorkflowState.EDITORIAL_REVIEWED,
    });
  });

  it("17b. prefers the marked v2 block over canonical lines in prose", () => {
    const result = inspectEditorialReview(
      [
        "Tham chiếu mẫu cũ: PROVISIONAL_TOTAL_SCORE: 70",
        marked(diagnosis({ totalScore: 88, insightScore: 22 })),
      ].join("\n"),
    );
    expect(result.machineContract).toBe("v2");
    expect(result.totalScore).toBe(88);
  });
});

describe("Editorial format retry semantics", () => {
  it("11+12. retries format on its own finite counter", () => {
    expect(MAX_EDITORIAL_REVIEW_FORMAT_RETRIES).toBeGreaterThan(0);
    expect(MAX_EDITORIAL_REVIEW_FORMAT_RETRIES).toBeLessThan(
      MAX_REVISION_REMEDIATION_RETRIES,
    );
    expect(workflowSource).toContain("if (inspection.parseFailure) {");
    expect(workflowSource).toContain('"editorial-review-format-invalid"');
    expect(workflowSource).toContain('"editorial-review-format-exhausted"');
    expect(workflowSource).toContain("MAX_EDITORIAL_REVIEW_FORMAT_RETRIES");
  });

  it("11b. the repair prompt fixes format without re-reviewing", () => {
    const prompt = buildEditorialFormatRepairPromptV2({
      previousOutput: "totalScore 89, insight 23, tất cả gate PASSED",
      malformedReason: "json-truncated",
    });
    expect(prompt).toContain("Do NOT review the article again");
    expect(prompt).toContain("EDITORIAL_DIAGNOSIS_JSON:");
    expect(prompt).toContain("Never emit 0 for totalScore");
    expect(prompt).not.toContain("FROZEN_CANDIDATE");
  });

  it("11c. a repaired response parses back into a normal verdict", () => {
    const repaired = inspectEditorialReview(
      marked(diagnosis({ totalScore: 89, insightScore: 23 })),
    );
    expect(repaired.parseFailure).toBe(false);
    expect(repaired.resolvedState).toBe(WorkflowState.EDITORIAL_REVIEWED);
  });

  it("12b. exhausted format retry pauses for a human instead of REWRITE", () => {
    expect(workflowSource).toContain(
      "withHumanReviewPendingMark(\n                      `${EDITORIAL_PARSER_PAUSE_HEADING}",
    );
    expect(workflowSource).toContain("bản nháp tốt nhất được giữ nguyên");
  });

  it("13. format failures never consume the revision remediation budget", () => {
    const transitions = [
      { action: "editorial-review-format-invalid", createdAt: "2026-08-07T00:00:00Z" },
      { action: "editorial-review-format-invalid", createdAt: "2026-08-07T00:05:00Z" },
      { action: "editorial-review-format-exhausted", createdAt: "2026-08-07T00:10:00Z" },
    ];
    const budget = countRemediationsInCurrentCycle(
      transitions,
      "remediate-required-revision",
    );
    expect(budget.cycleCount).toBe(0);
    expect(
      isRemediationBudgetExhausted(
        budget.cycleCount,
        MAX_REVISION_REMEDIATION_RETRIES,
      ),
    ).toBe(false);
    expect(workflowSource).toContain("revisionBudgetConsumed: false");
  });

  it("hardened diagnosis prompt forbids placeholder and string scores", () => {
    const prompt = buildEditorialDiagnosisPromptV2("CONTEXT");
    expect(prompt).toContain("never 0 placeholders");
    expect(prompt).toContain("JSON numbers, never strings");
    expect(prompt).toContain("No trailing comma");
  });
});

describe("Production trajectory 64 → 89 → malformed", () => {
  const best = {
    draftRevision: 4,
    editorialScore: 89,
    gateFailCount: 0,
    decision: "MINOR_REVISION_REQUIRED",
    workflowVersion: 7,
    reviewedAt: "2026-08-07T02:00:00.000Z",
    cycleId: "workflow-run:start",
    cycleAnchorAction: null,
    deploymentVersion: "test",
  };

  it("16. keeps the 89 candidate when the next review is unparseable", () => {
    const malformed = inspectEditorialReview(
      marked(diagnosis({ totalScore: 0, insightScore: 0 })),
    );
    expect(malformed.parseFailure).toBe(true);
    expect(malformed.malformedReasonCode).toBe("degenerate-scores");

    const lock = evaluateCandidateLock({
      config: { enabled: true, epsilon: 0 },
      bestBefore: best,
      // The workflow never builds a candidate for a parse failure.
      candidate: null,
      machineReadable: false,
    });
    expect(lock.bestAfter?.editorialScore).toBe(89);
    expect(lock.candidateEligible).toBe(false);
  });

  it("does not reproduce 89 → 0 → REWRITE_REQUIRED → exhausted", () => {
    // 64 is a real content verdict; only the later parser failure was false.
    const first = inspectEditorialReview(
      marked(diagnosis({ totalScore: 64, insightScore: 18, decision: "REWRITE_REQUIRED" })),
    );
    const improved = inspectEditorialReview(
      marked(diagnosis({ totalScore: 89, insightScore: 23, decision: "MINOR_REVISION_REQUIRED" })),
    );
    const broken = inspectEditorialReview(
      `EDITORIAL_DIAGNOSIS_JSON:\n{"contractVersion":"editorial-diagnosis.v2","totalScore":89,`,
    );

    expect(first.resolvedState).toBe(WorkflowState.REWRITE_REQUIRED);
    expect(first.machineReadable).toBe(true);
    expect(improved.resolvedState).toBe(WorkflowState.MINOR_REVISION_REQUIRED);
    expect(improved.totalScore).toBe(89);

    expect(broken.parseFailure).toBe(true);
    expect(broken.totalScore).toBeNull();
    expect(broken.resolvedState).not.toBe(WorkflowState.REWRITE_REQUIRED);

    const budgetAfterParserFailures = countRemediationsInCurrentCycle(
      [
        { action: "remediate-required-revision", createdAt: "2026-08-07T01:00:00Z" },
        { action: "editorial-review-format-invalid", createdAt: "2026-08-07T03:00:00Z" },
        { action: "editorial-review-format-exhausted", createdAt: "2026-08-07T03:05:00Z" },
      ],
      "remediate-required-revision",
    );
    expect(budgetAfterParserFailures.cycleCount).toBe(1);
    expect(
      isRemediationBudgetExhausted(
        budgetAfterParserFailures.cycleCount,
        MAX_REVISION_REMEDIATION_RETRIES,
      ),
    ).toBe(false);
  });
});
