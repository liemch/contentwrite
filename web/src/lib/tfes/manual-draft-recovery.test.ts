import { describe, expect, it } from "vitest";
import {
  assertExpectedWorkflowVersion,
  prepareManualDraftRecovery,
} from "@/lib/tfes/manual-draft-recovery";
import {
  FINAL_REVIEW_DONE_MARK,
  POST_REVISION_REVIEW_MARK,
  WRITE_DONE_MARK,
} from "@/lib/tfes/parser";

describe("manual draft recovery", () => {
  it("preserves counters, appends a complete draft and returns to Editorial Review checkpoint", () => {
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
      currentDraft: "old draft",
      knowledgeRecord: `# Review\nOld\n\n## Final Verification (pipeline)\nFail\n${FINAL_REVIEW_DONE_MARK}`,
      factCheck: "PASSED",
      errorMessage: "Revision chưa đạt sau 3 lần remediation — cần editor sửa tay.",
      revisionAttempts: 3,
      factAttempts: 1,
    });

    expect(prepared.articlePatch.draft12).toContain(WRITE_DONE_MARK);
    expect(prepared.articlePatch.knowledgeRecord).toContain(POST_REVISION_REVIEW_MARK);
    expect(prepared.articlePatch.knowledgeRecord).not.toContain("Final Verification");
    expect(prepared.articlePatch.factCheck).toBeNull();
    expect(prepared.details).toMatchObject({
      checkpoint: "editorial-review",
      countersReset: false,
      recoveryCycleBudgetReset: true,
      revisionAttempts: 3,
      factAttempts: 1,
      remediationCount: 3,
    });
  });

  it("enforces optimistic version and exhausted-only recovery", () => {
    expect(() => assertExpectedWorkflowVersion(5, 4)).toThrow(/Workflow conflict/);
    expect(() =>
      prepareManualDraftRecovery({
        draftMarkdown: "x".repeat(100),
        currentDraft: null,
        knowledgeRecord: null,
        factCheck: null,
        errorMessage: null,
        revisionAttempts: 0,
        factAttempts: 0,
      }),
    ).toThrow(/exhausted/);
  });
});
