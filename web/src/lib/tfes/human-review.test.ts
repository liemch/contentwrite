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

  it("input malformed không crash và không tạo finding giả", () => {
    expect(() =>
      parseEditorialFindings(asKnowledgeRecord("| Pass/Fail |\n|||\n\u0000")),
    ).not.toThrow();
    expect(
      parseEditorialFindings(asKnowledgeRecord("| Pass/Fail |\n|||\n\u0000")),
    ).toEqual([]);
  });
});
