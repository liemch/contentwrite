import { describe, expect, it } from "vitest";
import { summarizeFactCheck } from "@/lib/tfes/fact-ledger";
import { buildRemediationTelemetry } from "@/lib/tfes/remediation-telemetry";

const ledger = [
  "| Claim ID | Khẳng định | Kind | Source | Verdict | Action |",
  "| --- | --- | --- | --- | --- | --- |",
  "| 1 | Latency giảm 40% sau khi bật cache | Fact | https://a.example | Unsupported | fix |",
  "| 2 | Chi phí vận hành sẽ giảm trong 2027 | Prediction | https://b.example | Unverifiable | keep |",
  "| 3 | Đội ngũ dùng Postgres 16 ở production |  Fact |  | Unverifiable | cite |",
  "| 4 | Redis là in-memory store | Fact | https://c.example | Supported | keep |",
  "Verification Status: FAILED",
].join("\n");

describe("summarizeFactCheck", () => {
  it("derives counts from the existing ledger parser only", () => {
    const summary = summarizeFactCheck(ledger);

    expect(summary.verdict).toBe("FAILED");
    expect(summary.claimCount).toBe(4);
    expect(summary.unsupportedClaimCount).toBe(1);
    // Prediction-tagged Unverifiable is not blocking; the untagged one is.
    expect(summary.unverifiableClaimCount).toBe(1);
    expect(summary.blockingClaimCount).toBe(2);
    expect(summary.claimsWithoutSourceCount).toBe(1);
    expect(summary.malformedOutput).toBe(false);
  });

  it("flags malformed output instead of inventing values", () => {
    const summary = summarizeFactCheck("model trả lời lan man, không có ledger");
    expect(summary.verdict).toBeNull();
    expect(summary.claimCount).toBe(0);
    expect(summary.malformedOutput).toBe(true);
  });

  it("treats an empty ledger as malformed rather than passed", () => {
    expect(summarizeFactCheck(null).malformedOutput).toBe(true);
    expect(summarizeFactCheck("").verdict).toBeNull();
  });
});

describe("fact check telemetry", () => {
  it("carries the fact summary, attempt and reason without leaking content", () => {
    const fact = summarizeFactCheck(ledger);
    const telemetry = buildRemediationTelemetry({
      articleId: "article-9",
      workflowState: "FACT_CHECK_FAILED",
      transitionName: "fact-check",
      draft: "x".repeat(4200),
      result: "fail",
      attempt: 2,
      retryCount: 2,
      lifetimeRemediationCount: 2,
      cycleRemediationCount: 2,
      decision: fact.verdict ?? "UNPARSED",
      failureReasons: ["Fact Check chưa PASSED — cần sửa claim. token=sk-live-secret"],
      machineReadable: true,
      machineContract: "fact-ledger",
      maxTokens: 2500,
      llmMs: 8400,
      errorClass: "content",
      fact,
    });

    expect(telemetry.transitionName).toBe("fact-check");
    expect(telemetry.attempt).toBe(2);
    expect(telemetry.decision).toBe("FAILED");
    expect(telemetry.fact).toMatchObject({
      blockingClaimCount: 2,
      unsupportedClaimCount: 1,
      claimsWithoutSourceCount: 1,
      malformedOutput: false,
    });
    expect(telemetry.draftCharacterLength).toBe(4200);
    expect(telemetry.llmMs).toBe(8400);

    const serialized = JSON.stringify(telemetry);
    expect(serialized).not.toContain("sk-live-secret");
    expect(serialized).not.toContain("Latency giảm 40%");
    expect(serialized).not.toContain("https://a.example");
  });

  it("omits the fact block on non-fact transitions", () => {
    const telemetry = buildRemediationTelemetry({
      articleId: "article-9",
      workflowState: "DRAFTED",
      transitionName: "remediate-required-revision",
      draft: "y".repeat(120),
      result: "retry",
    });
    expect(telemetry.fact).toBeUndefined();
  });
});
