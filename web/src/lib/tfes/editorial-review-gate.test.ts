import { describe, expect, it } from "vitest";
import { WorkflowState } from "@/generated/prisma/client";
import {
  countEditorialGateFails,
  inspectEditorialReview,
} from "@/lib/tfes/editorial-review-gate";

function canonicalReview(decision: string): string {
  return [
    "PROVISIONAL_TOTAL_SCORE: 90",
    "PROVISIONAL_INSIGHT_SCORE: 23",
    "GATES_G1_G8: PASSED",
    `EDITORIAL_DECISION: ${decision}`,
  ].join("\n");
}

describe("Editorial Review machine contract", () => {
  it("parses typed Editorial Diagnosis v2 without inferring from prose", () => {
    const result = inspectEditorialReview(
      `EDITORIAL_DIAGNOSIS_JSON:
${JSON.stringify({
  contractVersion: "editorial-diagnosis.v2",
  totalScore: 86,
  insightScore: 22,
  gates: Array.from({ length: 8 }, (_, index) => ({
    id: `G${index + 1}`,
    status: "PASSED",
  })),
  decision: "MINOR_REVISION_REQUIRED",
  defects: [
    {
      defectId: "D-1",
      type: "CRAFT_LOCAL",
      severity: "MINOR",
      location: { sectionId: "deep-analysis" },
      diagnosis: "Repeated wording",
      requiredOutcome: "Remove repetition",
      allowedMutations: ["deep-analysis"],
      evidenceRefs: [],
      blocking: false,
      unknownFutureField: true,
    },
  ],
  requiredActions: ["Close D-1"],
  unknownFutureField: "ignored",
})}`,
    );
    expect(result).toMatchObject({
      machineReadable: true,
      machineContract: "v2",
      totalScore: 86,
      insightScore: 22,
      decision: "MINOR_REVISION_REQUIRED",
      resolvedState: WorkflowState.MINOR_REVISION_REQUIRED,
      gateFailures: [],
      requiredActions: ["Close D-1"],
    });
    expect(result.defects).toHaveLength(1);
    expect(result.defects[0].defectId).toBe("D-1");
  });

  it("fails safe when Editorial Diagnosis v2 omits a gate", () => {
    const result = inspectEditorialReview(
      `EDITORIAL_DIAGNOSIS_JSON:
${JSON.stringify({
  contractVersion: "editorial-diagnosis.v2",
  totalScore: 90,
  insightScore: 23,
  gates: [{ id: "G1", status: "PASSED" }],
  decision: "EDITORIAL_REVIEWED",
  defects: [],
  requiredActions: [],
})}`,
    );
    expect(result.machineReadable).toBe(false);
    expect(result.resolvedState).toBe(WorkflowState.MINOR_REVISION_REQUIRED);
  });

  it("không suy REWRITE từ phần giải thích liệt kê đủ enum", () => {
    const review = [
      "Các lựa chọn gồm EDITORIAL_REVIEWED, MINOR_REVISION_REQUIRED,",
      "MAJOR_REVISION_REQUIRED và REWRITE_REQUIRED.",
      "Ví dụ template: EDITORIAL_DECISION: <REWRITE_REQUIRED>",
    ].join("\n");
    const result = inspectEditorialReview(review);

    expect(result.machineReadable).toBe(false);
    expect(result.machineContract).toBe("invalid");
    expect(result.resolvedState).toBe(WorkflowState.MINOR_REVISION_REQUIRED);
    expect(result.resolvedState).not.toBe(WorkflowState.REWRITE_REQUIRED);
    expect(result.failureReasons).toContain(
      "machine output Editorial Review không hợp lệ — cần chấm lại",
    );
  });

  it("machine line hợp lệ trả đúng REWRITE", () => {
    const result = inspectEditorialReview(
      canonicalReview("REWRITE_REQUIRED")
        .replace("PROVISIONAL_TOTAL_SCORE: 90", "PROVISIONAL_TOTAL_SCORE: 70"),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.resolvedState).toBe(WorkflowState.REWRITE_REQUIRED);
  });

  it.each([
    ["EDITORIAL_REVIEWED", WorkflowState.EDITORIAL_REVIEWED],
    ["MINOR_REVISION_REQUIRED", WorkflowState.MINOR_REVISION_REQUIRED],
    ["MAJOR_REVISION_REQUIRED", WorkflowState.MAJOR_REVISION_REQUIRED],
  ])("machine line %s được parse đúng", (decision, expected) => {
    const score =
      decision === "MAJOR_REVISION_REQUIRED"
        ? 80
        : decision === "MINOR_REVISION_REQUIRED"
          ? 86
          : 90;
    const result = inspectEditorialReview(
      canonicalReview(decision).replace(
        "PROVISIONAL_TOTAL_SCORE: 90",
        `PROVISIONAL_TOTAL_SCORE: ${score}`,
      ),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.machineContract).toBe("canonical");
    expect(result.resolvedState).toBe(expected);
  });

  it("machine line malformed không bị parse oan thành REWRITE hoặc PASS", () => {
    const result = inspectEditorialReview(
      canonicalReview("REWRITE_REQUIRED").replace(
        "EDITORIAL_DECISION: REWRITE_REQUIRED",
        "EDITORIAL_DECISION => REWRITE_REQUIRED (ví dụ)",
      ),
    );
    expect(result.machineReadable).toBe(false);
    expect(result.resolvedState).toBe(WorkflowState.MINOR_REVISION_REQUIRED);
  });

  it("hỗ trợ rõ contract legacy FINAL_* từ output production cũ", () => {
    const result = inspectEditorialReview(
      [
        "FINAL_TOTAL_SCORE: 90",
        "FINAL_INSIGHT_SCORE: 23",
        "GATES_G1_G8: PASSED",
        "FINAL_DECISION: FINAL_REVIEWED",
      ].join("\n"),
    );
    expect(result.machineReadable).toBe(true);
    expect(result.machineContract).toBe("legacy");
    expect(result.resolvedState).toBe(WorkflowState.EDITORIAL_REVIEWED);
  });

  it("không trộn canonical thiếu field với legacy để tạo output hợp lệ giả", () => {
    const result = inspectEditorialReview(
      [
        "PROVISIONAL_TOTAL_SCORE: 90",
        "FINAL_INSIGHT_SCORE: 23",
        "GATES_G1_G8: PASSED",
        "FINAL_DECISION: FINAL_REVIEWED",
      ].join("\n"),
    );
    expect(result.machineContract).toBe("canonical");
    expect(result.machineReadable).toBe(false);
    expect(result.resolvedState).toBe(WorkflowState.MINOR_REVISION_REQUIRED);
  });
});

describe("Editorial Review checklist parser", () => {
  it("đếm bảng Markdown, bỏ header/separator/PASS và không đếm trùng", () => {
    const review = [
      "| Gate | Trạng thái | Ghi chú |",
      "|---|---|---|",
      "| G1 | FAIL | Thiếu phần kết |",
      "| G2 | PASS | Logic ổn |",
      "| G3 | Fail | Thiếu evidence |",
      "| G1 | FAIL | Lặp lại |",
    ].join("\n");
    expect(countEditorialGateFails(review)).toBe(2);
  });

  it("vẫn hỗ trợ bullet/checklist và PASS/FAIL hỗn hợp", () => {
    const review = [
      "- [ ] G1 Cấu trúc — Fail",
      "- [x] G2 Logic — Pass",
      "* G3 Evidence: FAILED",
      "G4 Insight — PASS",
    ].join("\n");
    expect(countEditorialGateFails(review)).toBe(2);
  });

  it("header, separator và input malformed không gây false positive", () => {
    expect(
      countEditorialGateFails(
        "| Tiêu chí | Pass/Fail | Ghi chú |\n|---|:---:|---|\n| không đủ cột",
      ),
    ).toBe(0);
  });
});
