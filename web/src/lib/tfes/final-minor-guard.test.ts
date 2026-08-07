import { describe, expect, it } from "vitest";
import { evaluateFinalMinorGuard } from "@/lib/tfes/final-minor-guard";

const base = {
  enabled: true,
  machineReadable: true,
  alreadyPublishReady: false,
  finalDecision: "MINOR_REVISION_REQUIRED",
  finalReview: "**Required Revisions:** polish wording and improve transition flow",
  finalScore: 85,
  finalInsightScore: 22,
  finalGatesPassed: true,
  factPassed: true,
  blockingClaims: 0,
  openActions: 0,
  editorialPassed: true,
  editorialScore: 85,
  editorialGateFailCount: 0,
  editorialThreshold: 85,
  insightFloor: 22,
} as const;

describe("WP-V2-03 False Final MINOR Guard", () => {
  it("suppresses a machine-readable craft-only 85 MINOR when enabled", () => {
    expect(evaluateFinalMinorGuard(base)).toEqual({
      eligible: true,
      suppressed: true,
      reasonClass: "craft-only",
      blockingResidualCount: 0,
      residualCount: 1,
    });
  });

  it("observes but does not suppress the same result when disabled", () => {
    expect(
      evaluateFinalMinorGuard({ ...base, enabled: false }),
    ).toMatchObject({
      eligible: true,
      suppressed: false,
      reasonClass: "craft-only",
    });
  });

  it("does not claim suppression already provided by existing near-miss policy", () => {
    expect(
      evaluateFinalMinorGuard({ ...base, alreadyPublishReady: true }),
    ).toMatchObject({
      eligible: false,
      suppressed: false,
      reasonClass: "already-publishable",
    });
  });

  it.each([
    ["Fact fail", { factPassed: false }, "precondition-failed"],
    ["Editorial gate fail", { editorialGateFailCount: 1 }, "precondition-failed"],
    ["Final gate fail", { finalGatesPassed: false }, "precondition-failed"],
    ["Insight below floor", { finalInsightScore: 21 }, "precondition-failed"],
    [
      "blocking required action",
      {
        finalReview:
          "**Required Revisions:** add missing source evidence for the unsupported claim",
      },
      "blocking-residual",
    ],
    [
      "MAJOR decision",
      { finalDecision: "MAJOR_REVISION_REQUIRED" },
      "not-minor",
    ],
    [
      "REWRITE decision",
      { finalDecision: "REWRITE_REQUIRED" },
      "not-minor",
    ],
    ["malformed output", { machineReadable: false }, "malformed"],
  ])("fails safe for %s", (_name, overrides, reasonClass) => {
    expect(
      evaluateFinalMinorGuard({ ...base, ...overrides }),
    ).toMatchObject({
      eligible: false,
      suppressed: false,
      reasonClass,
    });
  });

  it("does not suppress an unknown or missing Required Revisions value", () => {
    expect(
      evaluateFinalMinorGuard({
        ...base,
        finalReview: "**Required Revisions:** improve the article",
      }),
    ).toMatchObject({
      eligible: false,
      suppressed: false,
      reasonClass: "unknown-residual",
    });
    expect(
      evaluateFinalMinorGuard({
        ...base,
        finalReview: "FINAL_DECISION: MINOR_REVISION_REQUIRED",
      }),
    ).toMatchObject({
      eligible: false,
      suppressed: false,
      reasonClass: "unknown-residual",
    });
  });
});
