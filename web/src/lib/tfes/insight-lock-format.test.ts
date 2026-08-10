import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildInsightLockRepairPromptV2,
  insightLockParseFailure,
  parseInsightPlanLockV2,
} from "@/lib/tfes/prompts-v2";
import {
  MAX_INSIGHT_LOCK_FORMAT_RETRIES,
  isInsightLockFormatExhausted,
  isInsightLockFormatRetry,
} from "@/lib/tfes/retry-policy";

const workflowSource = readFileSync(
  new URL("./workflow.ts", import.meta.url),
  "utf8",
);

const truncatedLock = `INSIGHT_PLAN_LOCK_JSON:
{
  "contractVersion": "insight-plan-lock.v2",
  "thesis": "Retry mù làm sập dịch vụ nhanh hơn chính lỗi gốc",
  "insightLevel": "L3",
  "tests": { "soWhat": "PASS", "nonObvious": "PASS", "counterArgument": "PASS" },
  "audience": "Backend engineer vận hành hệ thống phân tán",
  "outline": [
    "Mở bằng sự cố retry storm",
    "Vì sao retry cứu được lỗi tạm thời`;

const validLock = `INSIGHT_PLAN_LOCK_JSON:\n${JSON.stringify({
  contractVersion: "insight-plan-lock.v2",
  thesis: "Retry mù làm sập dịch vụ nhanh hơn chính lỗi gốc",
  insightLevel: "L3",
  tests: { soWhat: "PASS", nonObvious: "PASS", counterArgument: "PASS" },
  audience: "Backend engineer",
  category: "reliability",
  angle: "retry storm",
  outline: ["a", "b"],
  keyInsights: ["c"],
  status: "LOCKED",
})}`;

describe("insight lock format failures", () => {
  it("phân biệt được JSON hỏng với phán quyết insight", () => {
    expect(insightLockParseFailure(truncatedLock)).toBeTruthy();
    expect(insightLockParseFailure(validLock)).toBeNull();
  });

  it("coi output không có marker là lỗi định dạng, không phải L1", () => {
    expect(insightLockParseFailure("Luận điểm này chỉ đạt L1 thôi")).toBe(
      "marker-missing",
    );
  });

  it("prompt sửa định dạng không chấm lại luận điểm", () => {
    const prompt = buildInsightLockRepairPromptV2({
      previousOutput: truncatedLock,
      malformedReason: "json-truncated",
    });
    expect(prompt).toContain("ROLE: FORMAT_REPAIR");
    expect(prompt).toContain("Do NOT re-judge the thesis");
    expect(prompt).toContain("json-truncated");
  });

  it("JSON hỏng làm parser trả null nên không được đọc thành gate fail", () => {
    expect(parseInsightPlanLockV2(truncatedLock)).toBeNull();
    expect(parseInsightPlanLockV2(validLock)?.status).toBe("LOCKED");
  });
});

describe("insight lock format retry semantics", () => {
  it("có counter riêng, nhỏ hơn budget nội dung", () => {
    expect(MAX_INSIGHT_LOCK_FORMAT_RETRIES).toBeGreaterThan(0);
    expect(workflowSource).toContain("MAX_INSIGHT_LOCK_FORMAT_RETRIES");
    expect(workflowSource).toContain('"insight-lock-format-invalid"');
  });

  it("lỗi định dạng không tiêu budget gate và không xoá research", () => {
    const branch = workflowSource.slice(
      workflowSource.indexOf("if (!parsedLock) {"),
      workflowSource.indexOf("const lockMarkdown = parsedLock.markdown;"),
    );
    expect(branch).toContain("INSIGHT_LOCK_FORMAT_INVALID_ACTION");
    expect(branch).toContain("gateBudgetConsumed: false");
    expect(branch).not.toContain("researchBrief: null");
    expect(branch).not.toContain("WorkflowState.INSIGHT_REJECTED");
    // Không đổ JSON hỏng ra bàn biên tập.
    expect(branch).not.toContain("insightGate:");
  });

  it("gate fail thật ghi rõ lý do thay vì luôn báo < L2", () => {
    expect(workflowSource).toContain('"GATE_TEXT_BELOW_L2"');
    expect(workflowSource).toContain("bằng chứng chưa đủ để chốt luận điểm");
    expect(workflowSource).toContain("reason: gateVerdict");
  });

  it("nhận diện đúng hai loại thông điệp lỗi", () => {
    const retryMessage =
      "Insight Lock output chưa đúng machine format (json-truncated; lần 1/2) — tự chấm lại cổng Insight.";
    const exhaustedMessage =
      "Insight Lock sai machine format sau 2 lần (json-truncated) — chưa chấm được cổng L2; research được giữ nguyên.";
    expect(isInsightLockFormatRetry(retryMessage)).toBe(true);
    expect(isInsightLockFormatExhausted(retryMessage)).toBe(false);
    expect(isInsightLockFormatExhausted(exhaustedMessage)).toBe(true);
    expect(isInsightLockFormatRetry(exhaustedMessage)).toBe(false);
  });
});
