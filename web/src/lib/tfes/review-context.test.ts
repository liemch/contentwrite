import { describe, expect, it } from "vitest";
import { clipText } from "@/lib/tfes/parser";
import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";
import { cleanGenMaxTokens } from "@/lib/tfes/quality";
import {
  MAX_TARGET_WORD_COUNT,
  MIN_TARGET_WORD_COUNT,
} from "@/lib/tfes/writing-prefs";
import {
  buildRevisionFeedbackBlock,
  extractFinalVerification,
  reviewDraftClipChars,
  withoutFinalVerification,
} from "@/lib/tfes/review-context";

/** Nháp 12 phần giả lập — References/Takeaways nằm cuối bài như Article.md. */
function fakeDraft(words: number): string {
  const filler = Array.from(
    { length: words },
    (_, i) => `từ${i % 97}`,
  ).join(" ");
  return [
    "# Tiêu đề bài viết",
    "## Introduction",
    filler,
    "## Key Takeaways",
    "- Bài học một",
    "## Discussion",
    "Câu hỏi thảo luận cuối bài?",
    "## References",
    "- https://example.com/nguon-that",
  ].join("\n\n");
}

describe("F1 · ngân sách context của reviewer", () => {
  it("giữ sàn 16.000 ký tự cho target mặc định", () => {
    expect(reviewDraftClipChars(PIPELINE_CONFIG.words.defaultTarget)).toBe(
      PIPELINE_CONFIG.context.reviewDraftMinChars,
    );
    expect(reviewDraftClipChars(null)).toBe(
      PIPELINE_CONFIG.context.reviewDraftMinChars,
    );
  });

  it("luôn rộng hơn mức 7.000 ký tự cũ trên mọi target hợp lệ", () => {
    for (const target of [MIN_TARGET_WORD_COUNT, 1200, 1800, MAX_TARGET_WORD_COUNT]) {
      expect(reviewDraftClipChars(target)).toBeGreaterThan(7_000);
      expect(reviewDraftClipChars(target)).toBeLessThanOrEqual(
        PIPELINE_CONFIG.context.reviewDraftMaxChars,
      );
    }
  });

  it("giãn theo targetWordCount nhưng không vượt trần", () => {
    expect(reviewDraftClipChars(2_000)).toBeGreaterThan(reviewDraftClipChars(1_200));
    expect(reviewDraftClipChars(MAX_TARGET_WORD_COUNT)).toBeLessThanOrEqual(
      PIPELINE_CONFIG.context.reviewDraftMaxChars,
    );
  });

  it("reviewer nhìn thấy References/Takeaways/Discussion ở cuối bài dài", () => {
    const draft = fakeDraft(1_800);
    expect(draft.length).toBeGreaterThan(7_000);

    const truncated = clipText(draft, 7_000);
    expect(truncated).not.toContain("## References");

    const visible = clipText(draft, reviewDraftClipChars(1_200));
    expect(visible).toContain("## Key Takeaways");
    expect(visible).toContain("## Discussion");
    expect(visible).toContain("## References");
    expect(visible).not.toContain("đã cắt");
  });
});

describe("F2 · ngân sách token của Revision Remediation", () => {
  it("cleanGenMaxTokens luôn cao hơn hardcode 5600/5200 cũ trên toàn dải target", () => {
    for (const target of [MIN_TARGET_WORD_COUNT, 1200, 1800, MAX_TARGET_WORD_COUNT]) {
      expect(cleanGenMaxTokens(target)).toBeGreaterThan(5_600);
      expect(cleanGenMaxTokens(target)).toBeGreaterThan(5_200);
    }
  });

  it("dùng đúng công thức 5 token/từ + buffer, có sàn và trần", () => {
    const { llm } = PIPELINE_CONFIG;
    expect(cleanGenMaxTokens(PIPELINE_CONFIG.words.defaultTarget)).toBe(
      llm.cleanMaxTokensFloor,
    );
    expect(cleanGenMaxTokens(2_000)).toBe(
      2_000 * llm.cleanTokensPerWord + llm.cleanTokensExtra,
    );
    expect(cleanGenMaxTokens(MAX_TARGET_WORD_COUNT)).toBeLessThanOrEqual(
      llm.cleanMaxTokensCap,
    );
  });

  it("target rỗng vẫn rơi về sàn, không về 0", () => {
    expect(cleanGenMaxTokens(null)).toBe(PIPELINE_CONFIG.llm.cleanMaxTokensFloor);
    expect(cleanGenMaxTokens(undefined)).toBe(PIPELINE_CONFIG.llm.cleanMaxTokensFloor);
  });
});

describe("F3 · feedback mới nhất trong prompt remediation", () => {
  const editorialReview = `# Editorial Review\n${"Nhận xét bước 8. ".repeat(400)}`;
  const finalVerification = [
    "FINAL_TOTAL_SCORE: 86",
    "FINAL_INSIGHT_SCORE: 23",
    "**Required Revisions:** siết lại điều kiện áp dụng ở mục khuyến nghị",
  ].join("\n");
  const knowledgeRecord = [
    editorialReview,
    "<!--TFES_REVIEW_DONE-->",
    "## Human Review (editor)",
    "- [decision] nhờ AI sửa tiếp",
    "## Final Verification (pipeline)",
    finalVerification,
  ].join("\n\n");

  it("knowledgeRecord thật dài hơn 6.000 ký tự nên prefix-clip cũ làm mất 9b", () => {
    expect(knowledgeRecord.length).toBeGreaterThan(6_000);
    expect(clipText(knowledgeRecord, 6_000)).not.toContain("Required Revisions");
  });

  it("extractFinalVerification lấy đúng block 9b", () => {
    const extracted = extractFinalVerification(knowledgeRecord);
    expect(extracted).toContain("Required Revisions");
    expect(extracted).toContain("FINAL_TOTAL_SCORE: 86");
    expect(extracted).not.toContain("Nhận xét bước 8");
  });

  it("giữ nguyên phần Reader Simulation nằm sau block 9b", () => {
    const withReaderSim = `${knowledgeRecord}\n\n## Reader Simulation\nGóp ý người đọc.`;
    expect(extractFinalVerification(withReaderSim)).not.toContain("Góp ý người đọc");
    expect(withoutFinalVerification(withReaderSim)).toContain("## Reader Simulation");
  });

  it("block feedback đưa lý do trượt và Required Revisions lên đầu", () => {
    const block = buildRevisionFeedbackBlock({
      errorMessage: "Final Verification chưa đạt — total 86<87.",
      knowledgeRecord,
    });
    expect(block).toContain("Lý do trượt lần gần nhất");
    expect(block).toContain("total 86<87");
    expect(block).toContain("Required Revisions");
    expect(block.indexOf("Lý do trượt lần gần nhất")).toBeLessThan(
      block.indexOf("Required Revisions"),
    );
  });

  it("withoutFinalVerification bỏ block 9b để không lặp nội dung", () => {
    const rest = withoutFinalVerification(knowledgeRecord);
    expect(rest).not.toContain("Required Revisions");
    expect(rest).not.toContain("## Final Verification (pipeline)");
    expect(rest).toContain("## Human Review (editor)");
  });

  it("không có feedback thì trả chuỗi rỗng (appendContext sẽ bỏ qua)", () => {
    expect(buildRevisionFeedbackBlock({})).toBe("");
    expect(
      buildRevisionFeedbackBlock({ errorMessage: "   ", knowledgeRecord: null }),
    ).toBe("");
  });
});
