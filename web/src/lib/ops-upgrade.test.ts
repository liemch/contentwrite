import { describe, expect, it } from "vitest";
import { buildOnboardingSteps } from "@/lib/onboarding";
import { findStaleArticles } from "@/lib/stale-articles";
import { WorkflowState } from "@/generated/prisma/client";

describe("onboarding checklist", () => {
  it("marks steps done based on workflow states", () => {
    const steps = buildOnboardingSteps([
      { id: "a1", workflowState: WorkflowState.PUBLISHED },
    ]);
    expect(steps.every((step) => step.done)).toBe(true);
  });
});

describe("stale article detection", () => {
  it("flags active articles idle over threshold", () => {
    const stale = findStaleArticles(
      [
        {
          id: "x",
          title: "T",
          topic: null,
          workflowState: WorkflowState.RESEARCHED,
          currentStep: "research",
          updatedAt: new Date(Date.now() - 45 * 60_000),
        },
      ],
      Date.now(),
      30 * 60_000,
    );
    expect(stale).toHaveLength(1);
  });
});
