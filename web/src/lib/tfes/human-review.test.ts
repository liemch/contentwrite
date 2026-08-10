import { describe, expect, it } from "vitest";
import { countEditorialGateFails } from "@/lib/tfes/editorial-review-gate";
import { parseEditorialFindings } from "@/lib/tfes/human-review";
import { REVIEW_DONE_MARK } from "@/lib/tfes/parser";

function asKnowledgeRecord(review: string): string {
  return `${review}\n\n${REVIEW_DONE_MARK}`;
}

describe("Human Review findings parser", () => {
  it("không lấy header hoặc separator Markdown làm finding", () => {
    const findings = parseEditorialFindings(
      asKnowledgeRecord(
        "| Tiêu chí | Pass/Fail | Ghi chú |\n|---|:---:|---|\n| G1 | PASS | Đủ |",
      ),
    );
    expect(findings).toEqual([]);
  });

  it("giữ row FAIL hợp lệ và bỏ row PASS", () => {
    const review = [
      "| Gate | Trạng thái | Ghi chú |",
      "|---|---|---|",
      "| G1 | FAIL | Thiếu References |",
      "| G2 | PASS | Logic ổn |",
    ].join("\n");
    const findings = parseEditorialFindings(asKnowledgeRecord(review));

    expect(findings.filter((finding) => finding.id.startsWith("gate-"))).toHaveLength(1);
    expect(findings[0]?.label).toContain("G1");
    expect(findings.some((finding) => finding.label.includes("G2"))).toBe(false);
  });

  it("machine gate và Human Review không lệch số gate Fail trên cùng input", () => {
    const review = [
      "| Gate | Status | Notes |",
      "|---|---|---|",
      "| G1 | FAIL | Thiếu kết |",
      "| G2 | PASS | OK |",
      "- [ ] G3 Evidence — Fail",
      "- [ ] G3 Evidence — Fail",
    ].join("\n");
    const gateFindings = parseEditorialFindings(asKnowledgeRecord(review)).filter(
      (finding) => finding.id.startsWith("gate-"),
    );
    expect(gateFindings).toHaveLength(countEditorialGateFails(review));
    expect(gateFindings).toHaveLength(2);
  });

  it("v2 diagnosis MAJOR với defects rỗng vẫn có điểm để chốt (gate FAILED)", () => {
    const diagnosis = {
      contractVersion: "editorial-diagnosis.v2",
      totalScore: 68,
      insightScore: 18,
      gates: [
        { id: "G1", status: "PASSED", reason: "Insight aligns with central thesis" },
        { id: "G2", status: "FAILED", reason: "Evidence from low-tier sources" },
        { id: "G3", status: "PASSED", reason: "Clear logical flow" },
      ],
      decision: "MAJOR_REVISION_REQUIRED",
      defects: [],
      requiredActions: [],
    };
    const findings = parseEditorialFindings(
      asKnowledgeRecord(`EDITORIAL_DIAGNOSIS_JSON: ${JSON.stringify(diagnosis)}`),
    );

    expect(findings.length).toBeGreaterThan(0);
    expect(findings.some((finding) => finding.label.includes("G2"))).toBe(true);
    expect(findings.some((finding) => finding.label.includes("G1"))).toBe(false);
  });

  it("v2 diagnosis đòi revision nhưng không gate fail vẫn trả finding decision", () => {
    const diagnosis = {
      contractVersion: "editorial-diagnosis.v2",
      gates: [{ id: "G1", status: "PASSED", reason: "OK" }],
      decision: "MAJOR_REVISION_REQUIRED",
      defects: [],
      requiredActions: [],
    };
    const findings = parseEditorialFindings(
      asKnowledgeRecord(`EDITORIAL_DIAGNOSIS_JSON: ${JSON.stringify(diagnosis)}`),
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe("decision");
  });

  it("v2 diagnosis PASS sạch không tạo finding", () => {
    const diagnosis = {
      contractVersion: "editorial-diagnosis.v2",
      gates: [{ id: "G1", status: "PASSED", reason: "OK" }],
      decision: "EDITORIAL_REVIEWED",
      defects: [],
      requiredActions: [],
    };
    expect(
      parseEditorialFindings(
        asKnowledgeRecord(`EDITORIAL_DIAGNOSIS_JSON: ${JSON.stringify(diagnosis)}`),
      ),
    ).toEqual([]);
  });

  it("input malformed không crash và không tạo finding giả", () => {
    expect(() =>
      parseEditorialFindings(asKnowledgeRecord("| Pass/Fail |\n|||\n\u0000")),
    ).not.toThrow();
    expect(
      parseEditorialFindings(asKnowledgeRecord("| Pass/Fail |\n|||\n\u0000")),
    ).toEqual([]);
  });
});
