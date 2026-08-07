import { describe, expect, it } from "vitest";
import {
  buildEditorValidationFeedback,
  mergeDeskJson,
  parseDeskJson,
} from "@/lib/tfes/desk-state";

describe("WP2.7 editor feedback", () => {
  it("ties feedback to article and user while preserving existing desk state", () => {
    const feedback = buildEditorValidationFeedback({
      articleId: "article-1",
      userId: "user-1",
      finalUsability: 5,
      manualEditEffort: 2,
      confusingStep: "Final Verification",
      errorHelpfulness: 4,
      reuseIntent: 5,
      note: "  Hữu ích  ",
      recordedAt: new Date("2026-08-07T00:00:00.000Z"),
    });
    const merged = parseDeskJson(
      mergeDeskJson(JSON.stringify({ factAckAt: "earlier" }), {
        validationFeedback: feedback,
      }),
    );

    expect(merged.factAckAt).toBe("earlier");
    expect(merged.validationFeedback).toEqual({
      ...feedback,
      note: "Hữu ích",
    });
  });

  it("rejects ratings outside 1–5 and bounds free text", () => {
    expect(() =>
      buildEditorValidationFeedback({
        articleId: "article-1",
        userId: "user-1",
        finalUsability: 0,
        manualEditEffort: 2,
        confusingStep: "",
        errorHelpfulness: 4,
        reuseIntent: 5,
      }),
    ).toThrow(/1 đến 5/);
  });
});
