import { describe, expect, it } from "vitest";
import {
  CREATION_MODES,
  humanizeWorkflowError,
  resolveCreationMode,
  resolveEditorJourneyProgress,
} from "@/lib/editor-journey";

describe("editor journey", () => {
  it("maps tracker progress to editor phases", () => {
    const early = resolveEditorJourneyProgress({ workflowState: "IDEA" });
    expect(early.phaseIndex).toBe(1);
    expect(early.current.id).toBe("research");
    expect(early.progressPercent).toBeLessThan(30);

    const done = resolveEditorJourneyProgress({ workflowState: "PUBLISH_READY" });
    expect(done.completed).toBe(true);
    expect(done.progressPercent).toBe(100);
  });

  it("flags awaiting human review", () => {
    const paused = resolveEditorJourneyProgress({
      workflowState: "EDITORIAL_REVIEWED",
      knowledgeRecord: "<!--TFES_REVIEW_DONE-->",
      factCheck: "",
    });
    expect(paused.awaitingHuman).toBe(true);
    expect(paused.label).toContain("xác nhận");
  });

  it("humanizes technical errors", () => {
    expect(humanizeWorkflowError("Request timed out")).toContain("Giữ tab");
    expect(humanizeWorkflowError("Gate < L2 — nghiên cứu lại")).toContain("Góc bài");
    expect(humanizeWorkflowError("Custom message")).toBe("Custom message");
  });

  it("exposes creation modes", () => {
    expect(CREATION_MODES.fast.wordTarget).toBe(550);
    expect(resolveCreationMode("fast")).toBe("fast");
    expect(resolveCreationMode(undefined)).toBe("standard");
  });
});
