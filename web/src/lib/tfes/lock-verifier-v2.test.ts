import { describe, expect, it } from "vitest";
import { inspectFinalVerification } from "@/lib/tfes/final-verification";

const passedFact = [
  "| Claim ID | Vị trí | Claim | Loại | Mức quan trọng | Nguồn đã đọc | Evidence excerpt | Ngày | Verdict | Confidence | Xử lý |",
  "|---|---|---|---|---|---|---|---|---|---|---|",
  "| C-001 | Intro | A supported claim | Fact | Central | https://example.com | excerpt | 2026 | Supported | High | keep |",
  "VERIFICATION_STATUS: PASSED",
].join("\n");

function lockOutput(overrides: Record<string, unknown> = {}): string {
  return `LOCK_DECISION_JSON:
${JSON.stringify({
  contractVersion: "lock-decision.v2",
  lockDecision: "LOCKED",
  factLockStatus: "PASSED",
  insightFloorStatus: "PASSED",
  blockingResiduals: [],
  openRequiredActions: [],
  unresolvedDefectIds: [],
  regressionDetected: false,
  optionalPolishActions: [],
  ...overrides,
})}`;
}

describe("Lock Verifier v2 machine contract", () => {
  it("locks Editorial PASS + Fact PASS despite optional craft-only polish", () => {
    const result = inspectFinalVerification(
      lockOutput({ optionalPolishActions: ["Tighten one transition"] }),
      passedFact,
    );
    expect(result).toMatchObject({
      machineReadable: true,
      machineContract: "lock-v2",
      lockDecision: "LOCKED",
      publishReady: true,
      decision: "FINAL_REVIEWED",
    });
    expect(result.optionalPolishActions).toEqual(["Tighten one transition"]);
  });

  it("fails lock when a blocking residual remains", () => {
    const result = inspectFinalVerification(
      lockOutput({
        lockDecision: "PATCH_REQUIRED",
        blockingResiduals: ["D-7 unresolved logic contradiction"],
      }),
      passedFact,
    );
    expect(result.publishReady).toBe(false);
    expect(result.machineReadable).toBe(true);
    expect(result.decision).toBe("MINOR_REVISION_REQUIRED");
    expect(result.failureReasons).toContain("1 blocking residual");
  });

  it("fails safe on malformed output instead of reading prose decisions", () => {
    const result = inspectFinalVerification(
      "The lock should probably be LOCKED.",
      passedFact,
    );
    expect(result.machineReadable).toBe(false);
    expect(result.publishReady).toBe(false);
    expect(result.machineContract).toBe("invalid");
  });

  it("fails safe when the marked v2 object misses required fields", () => {
    const result = inspectFinalVerification(
      'LOCK_DECISION_JSON:\n{"contractVersion":"lock-decision.v2","lockDecision":"LOCKED"}',
      passedFact,
    );
    expect(result.machineReadable).toBe(false);
    expect(result.publishReady).toBe(false);
    expect(result.malformedOutput).toBe(true);
  });

  it("does not map CONTEXT_INCOMPLETE to a remediation decision", () => {
    const result = inspectFinalVerification(
      lockOutput({ lockDecision: "CONTEXT_INCOMPLETE" }),
      passedFact,
    );
    expect(result.machineReadable).toBe(true);
    expect(result.machineContract).toBe("lock-v2");
    expect(result.lockDecision).toBe("CONTEXT_INCOMPLETE");
    expect(result.publishReady).toBe(false);
    expect(result.decision).toBeNull();
  });
});

