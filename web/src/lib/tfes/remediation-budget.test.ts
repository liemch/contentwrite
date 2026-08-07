import { describe, expect, it } from "vitest";
import {
  countRemediationsInCurrentCycle,
  isRemediationBudgetExhausted,
  latestRemediationCycleAnchor,
  REMEDIATION_CYCLE_ANCHOR_ACTIONS,
} from "@/lib/tfes/remediation-budget";
import { MAX_FACT_REMEDIATION_RETRIES } from "@/lib/tfes/fact-ledger";
import { MAX_REVISION_REMEDIATION_RETRIES } from "@/lib/tfes/retry-policy";
import { buildRemediationTelemetry } from "@/lib/tfes/remediation-telemetry";
import { prepareManualDraftRecovery } from "@/lib/tfes/manual-draft-recovery";
import { WRITE_DONE_MARK } from "@/lib/tfes/parser";

function at(minute: number) {
  return new Date(`2026-08-07T10:${String(minute).padStart(2, "0")}:00.000Z`);
}

describe("remediation budget cycles", () => {
  it("picks the newest cycle anchor between human-review-confirmed and manual-draft-revision", () => {
    const history = [
      { action: "manual-draft-revision", createdAt: at(1) },
      { action: "remediate-required-revision", createdAt: at(2) },
      { action: "human-review-confirmed", createdAt: at(3) },
      { action: "remediate-required-revision", createdAt: at(4) },
    ];
    expect(REMEDIATION_CYCLE_ANCHOR_ACTIONS).toEqual([
      "human-review-confirmed",
      "manual-draft-revision",
    ]);
    expect(latestRemediationCycleAnchor(history)?.action).toBe("human-review-confirmed");
    expect(
      countRemediationsInCurrentCycle(history, "remediate-required-revision"),
    ).toMatchObject({
      lifetimeCount: 2,
      cycleCount: 1,
      cycleAnchorAction: "human-review-confirmed",
    });
  });

  it("counts only remediations after the newest cycle anchor", () => {
    const history = [
      { action: "remediate-required-revision", createdAt: at(1) },
      { action: "remediate-required-revision", createdAt: at(2) },
      { action: "manual-draft-revision", createdAt: at(3) },
      { action: "remediate-required-revision", createdAt: at(4) },
    ];
    const budget = countRemediationsInCurrentCycle(
      history,
      "remediate-required-revision",
    );
    expect(budget.lifetimeCount).toBe(3);
    expect(budget.cycleCount).toBe(1);
  });

  it("revision×3 → manual recovery → revision×1 → human confirm → revision×2", () => {
    const history = [
      { action: "remediate-required-revision", createdAt: at(1) },
      { action: "remediate-required-revision", createdAt: at(2) },
      { action: "remediate-required-revision", createdAt: at(3) },
      { action: "revision-remediation-exhausted", createdAt: at(4) },
      { action: "manual-draft-revision", createdAt: at(5) },
      { action: "remediate-required-revision", createdAt: at(6) },
      { action: "human-review-confirmed", createdAt: at(7) },
      { action: "remediate-required-revision", createdAt: at(8) },
      { action: "remediate-required-revision", createdAt: at(9) },
    ];

    const budget = countRemediationsInCurrentCycle(
      history,
      "remediate-required-revision",
    );
    expect(budget.lifetimeCount).toBe(6);
    expect(budget.cycleCount).toBe(2);
    expect(budget.cycleAnchorAction).toBe("human-review-confirmed");
    expect(
      isRemediationBudgetExhausted(budget.cycleCount, MAX_REVISION_REMEDIATION_RETRIES),
    ).toBe(false);
  });

  it("keeps revision and fact remediation budgets independent", () => {
    const history = [
      { action: "remediate-required-revision", createdAt: at(1) },
      { action: "remediate-required-revision", createdAt: at(2) },
      { action: "remediate-fact-check", createdAt: at(3) },
      { action: "remediate-fact-check", createdAt: at(4) },
      { action: "remediate-fact-check", createdAt: at(5) },
      { action: "manual-draft-revision", createdAt: at(6) },
      { action: "remediate-required-revision", createdAt: at(7) },
    ];

    const revision = countRemediationsInCurrentCycle(
      history,
      "remediate-required-revision",
    );
    const fact = countRemediationsInCurrentCycle(history, "remediate-fact-check");

    expect(revision).toMatchObject({
      lifetimeCount: 3,
      cycleCount: 1,
    });
    expect(fact).toMatchObject({
      lifetimeCount: 3,
      cycleCount: 0,
    });
    expect(
      isRemediationBudgetExhausted(fact.lifetimeCount, MAX_FACT_REMEDIATION_RETRIES),
    ).toBe(true);
    expect(
      isRemediationBudgetExhausted(fact.cycleCount, MAX_FACT_REMEDIATION_RETRIES),
    ).toBe(false);
    expect(
      isRemediationBudgetExhausted(revision.cycleCount, MAX_REVISION_REMEDIATION_RETRIES),
    ).toBe(false);
  });

  it("never resets lifetime count across recovery anchors", () => {
    const before = [
      { action: "remediate-required-revision", createdAt: at(1) },
      { action: "remediate-required-revision", createdAt: at(2) },
      { action: "remediate-required-revision", createdAt: at(3) },
    ];
    const afterRecovery = [
      ...before,
      { action: "manual-draft-revision", createdAt: at(4) },
      { action: "remediate-required-revision", createdAt: at(5) },
    ];
    expect(
      countRemediationsInCurrentCycle(before, "remediate-required-revision").lifetimeCount,
    ).toBe(3);
    expect(
      countRemediationsInCurrentCycle(afterRecovery, "remediate-required-revision")
        .lifetimeCount,
    ).toBe(4);
  });

  it("exhausted → manual recovery → review → still needs remediation: allows a new cycle budget", () => {
    const history = [
      { action: "editorial-review", createdAt: at(1) },
      { action: "remediate-required-revision", createdAt: at(2) },
      { action: "editorial-review-after-revision", createdAt: at(3) },
      { action: "remediate-required-revision", createdAt: at(4) },
      { action: "editorial-review-after-revision", createdAt: at(5) },
      { action: "remediate-required-revision", createdAt: at(6) },
      { action: "editorial-review-after-revision", createdAt: at(7) },
      { action: "revision-remediation-exhausted", createdAt: at(8) },
      { action: "manual-draft-revision", createdAt: at(9) },
      { action: "editorial-review", createdAt: at(10) },
    ];

    const budget = countRemediationsInCurrentCycle(
      history,
      "remediate-required-revision",
    );
    expect(budget.lifetimeCount).toBe(3);
    expect(budget.cycleCount).toBe(0);
    expect(budget.cycleAnchorAction).toBe("manual-draft-revision");
    expect(
      isRemediationBudgetExhausted(budget.cycleCount, MAX_REVISION_REMEDIATION_RETRIES),
    ).toBe(false);
  });

  it("without any cycle anchor, lifetime and cycle counts are identical", () => {
    const history = [
      { action: "remediate-required-revision", createdAt: at(1) },
      { action: "remediate-required-revision", createdAt: at(2) },
      { action: "remediate-required-revision", createdAt: at(3) },
    ];
    const budget = countRemediationsInCurrentCycle(
      history,
      "remediate-required-revision",
    );
    expect(budget.lifetimeCount).toBe(3);
    expect(budget.cycleCount).toBe(3);
    expect(budget.cycleAnchorAction).toBeNull();
    expect(
      isRemediationBudgetExhausted(budget.cycleCount, MAX_REVISION_REMEDIATION_RETRIES),
    ).toBe(true);
  });
});

describe("manual recovery preserves history while opening a cycle", () => {
  it("does not delete transitions/artifacts and only appends a new draft revision", () => {
    const body = [
      "# Bài recovery",
      "Nội dung đủ dài để đại diện cho toàn bộ bản Markdown sau khi editor sửa tay.",
      "## Key Takeaways",
      "Một kết luận có thể kiểm chứng.",
      "## Discussion",
      "Phân tích.",
      "## References",
      "- https://example.com",
    ].join("\n");
    const prepared = prepareManualDraftRecovery({
      draftMarkdown: body,
      currentDraft: `old draft\n\n${WRITE_DONE_MARK}`,
      knowledgeRecord: "# Review\nOld",
      factCheck: "PASSED",
      errorMessage: "Revision chưa đạt sau 3 lần remediation — cần editor sửa tay.",
      revisionAttempts: 3,
      factAttempts: 2,
    });

    expect(prepared.details.countersReset).toBe(false);
    expect(prepared.details.recoveryCycleBudgetReset).toBe(true);
    expect(prepared.details.revisionAttempts).toBe(3);
    expect(prepared.articlePatch.draft12).toContain(WRITE_DONE_MARK);
    // Patch only clears downstream fields; it never encodes delete of transitions/artifacts.
    expect(JSON.stringify(prepared)).not.toMatch(/deleteMany|delete:|truncate/i);
  });
});

describe("telemetry lifetime vs cycle labels", () => {
  it("records both lifetime and cycle counts so timeline labels stay unambiguous", () => {
    const telemetry = buildRemediationTelemetry({
      articleId: "a1",
      workflowState: "DRAFTED",
      transitionName: "remediate-required-revision",
      draft: "x".repeat(100),
      result: "retry",
      attempt: 2,
      lifetimeRemediationCount: 6,
      cycleRemediationCount: 2,
    });
    expect(telemetry.lifetimeRemediationCount).toBe(6);
    expect(telemetry.cycleRemediationCount).toBe(2);
    expect(telemetry.remediationCount).toBe(2);
  });
});
