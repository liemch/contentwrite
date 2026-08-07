import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("WP2.7 authorization and wiring", () => {
  it("keeps deployment diagnostics admin-only", () => {
    const route = source("src/app/api/health/version/route.ts");
    expect(route).toContain("requireAdmin()");
    expect(route).toContain("getDeploymentVersion()");
    expect(route).not.toContain("process.env");
  });

  it("keeps timeline, recovery and feedback behind article ownership", () => {
    const timeline = source("src/app/api/articles/[id]/workflow/route.ts");
    const actions = source("src/app/api/articles/[id]/actions/route.ts");
    for (const route of [timeline, actions]) {
      expect(route).toContain("requireUser()");
      expect(route).toContain("assertCanAccessArticle(user, article)");
    }
    expect(actions).toContain('"save-manual-draft"');
    expect(actions).toContain('"save-validation-feedback"');
    expect(actions.indexOf("assertCanAccessArticle(user, article)")).toBeLessThan(
      actions.indexOf("switch (body.action)"),
    );
  });

  it("persists safe telemetry at every required remediation path", () => {
    const workflow = source("src/lib/tfes/workflow.ts");
    expect(workflow).toContain('"editorial-review-after-revision"');
    expect(workflow).toContain('"editorial-review"');
    for (const action of [
      "remediate-required-revision",
      "fact-remediation-exhausted",
      "remediate-fact-check",
      "final-verification-format-invalid",
      "final-verification",
      "workflow-step-error",
      "manual-draft-revision",
    ]) {
      expect(workflow).toContain(`transitionName: "${action}"`);
    }
    const telemetry = source("src/lib/tfes/remediation-telemetry.ts");
    expect(telemetry).not.toContain("fullPrompt");
    expect(telemetry).not.toContain("apiKey:");
  });

  it("records Fact Check itself so the timeline shows validation between remediations", () => {
    const workflow = source("src/lib/tfes/workflow.ts");
    const timeline = source("src/components/remediation-timeline.tsx");
    expect(workflow).toContain('transitionName: "fact-check"');
    expect(workflow).toContain("summarizeFactCheck(factCheckContent)");
    expect(workflow).toContain('remediationAction: "fact-check"');
    // Timeline renders any transition carrying telemetry; fact rows add a reason label.
    expect(timeline).toContain("factFailureLabel");
    expect(timeline).toContain("blockingClaimCount");
    // Fact Check rows recorded before WP2.7.1 have no telemetry and must still render.
    expect(timeline).toContain("legacyFactTelemetry");
    const factLedger = source("src/lib/tfes/fact-ledger.ts");
    expect(factLedger).toContain("export function summarizeFactCheck");
    expect(factLedger).not.toContain("claimText");
  });

  it("opens a fresh remediation budget after manual draft recovery without deleting lifetime history", () => {
    const workflow = source("src/lib/tfes/workflow.ts");
    const budget = source("src/lib/tfes/remediation-budget.ts");
    expect(budget).toContain('"manual-draft-revision"');
    expect(budget).toContain('"human-review-confirmed"');
    expect(workflow).toContain("remediationBudgetForRun");
    expect(workflow).toContain("countRemediationsInCurrentCycle");
    expect(workflow).toContain("lifetimeRemediationCount");
    expect(workflow).toContain("cycleRemediationCount");
    expect(source("src/lib/tfes/manual-draft-recovery.ts")).toContain(
      "recoveryCycleBudgetReset: true",
    );
  });

  it("does not let the client forge cycle-anchor transitions", () => {
    const actions = source("src/app/api/articles/[id]/actions/route.ts");
    const workflow = source("src/lib/tfes/workflow.ts");
    // Client may only request the typed save action; server alone writes the anchor.
    expect(actions).toContain('"save-manual-draft"');
    expect(actions).not.toContain('"manual-draft-revision"');
    expect(actions).not.toContain('"human-review-confirmed"');
    expect(actions).toContain("saveManualDraftRevision(");
    expect(actions).toContain("confirmHumanReview(");
    expect(workflow).toContain('action: "manual-draft-revision"');
    expect(workflow).toContain('action: "human-review-confirmed"');
    // Recovery appends a new ARTICLE_DRAFT revision; it must not wipe history tables.
    const recovery = workflow.slice(
      workflow.indexOf("export async function saveManualDraftRevision"),
      workflow.indexOf("export async function confirmHumanReview"),
    );
    expect(recovery).toContain("sourceRevision: previousDraftRevision");
    expect(recovery).not.toMatch(/workflowTransition\.delete|workflowArtifact\.delete/);
  });

  it("writes lifetime and cycle counts into remediation telemetry", () => {
    const telemetry = source("src/lib/tfes/remediation-telemetry.ts");
    const timeline = source("src/components/remediation-timeline.tsx");
    expect(telemetry).toContain("lifetimeRemediationCount");
    expect(telemetry).toContain("cycleRemediationCount");
    expect(timeline).toContain("cycle");
    expect(timeline).toContain("lifetime");
    expect(timeline).toContain("remediationBudgetLabel");
  });
});
