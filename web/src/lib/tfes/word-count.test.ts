import { describe, expect, it } from "vitest";
import { countProseSyllables, countProseWords, extractProse, wordsToSyllables } from "@/lib/tfes/word-count";
import { cleanWordBounds } from "@/lib/tfes/quality";
import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

const VI_PARAGRAPH =
  "Đội hạ tầng phát hiện hàng đợi ghi vào cơ sở dữ liệu dồn ứ mỗi khi bản vá được triển khai vào buổi chiều thứ sáu.";

describe("extractProse", () => {
  it("bỏ hero image, code fence và URL khỏi phần đếm", () => {
    const prose = extractProse(
      [
        "# Tiêu đề bài viết",
        "*Phụ đề nghiêng*",
        "![ảnh minh hoạ](HERO_IMAGE)",
        VI_PARAGRAPH,
        "```ts",
        "const a = 1;",
        "```",
        "Xem thêm tại https://example.com/bai-viet để biết chi tiết.",
      ].join("\n\n"),
    );
    expect(prose).not.toContain("HERO_IMAGE");
    expect(prose).not.toContain("const a = 1");
    expect(prose).not.toContain("https://");
    expect(prose).toContain("cơ sở dữ liệu");
  });

  it("cắt khối References tới hết bài", () => {
    const prose = extractProse(
      [VI_PARAGRAPH, "## References", "- Nguồn A — https://a.dev", "- Nguồn B — https://b.dev"].join(
        "\n\n",
      ),
    );
    expect(prose).not.toContain("Nguồn A");
    expect(prose).toContain("hàng đợi");
  });

  it("giữ đoạn sau khi References kết thúc bằng heading cùng cấp", () => {
    const prose = extractProse(
      ["## References", "- Nguồn A", "## Ghi chú cuối", "Đoạn này vẫn phải được đếm."].join("\n\n"),
    );
    expect(prose).not.toContain("Nguồn A");
    expect(prose).toContain("Đoạn này vẫn phải được đếm");
  });
});

describe("countProseWords", () => {
  it("quy đổi tiếng sang từ tiếng Việt thật", () => {
    const syllables = countProseSyllables(VI_PARAGRAPH);
    const words = countProseWords(VI_PARAGRAPH);
    expect(syllables).toBeGreaterThan(words);
    expect(words).toBe(Math.round(syllables / PIPELINE_CONFIG.words.syllablesPerWord));
  });

  it("References không làm phồng số từ", () => {
    const withRefs = `${VI_PARAGRAPH}\n\n## References\n\n- Nguồn A — https://a.dev\n- Nguồn B — https://b.dev\n- Nguồn C — https://c.dev`;
    expect(countProseWords(withRefs)).toBe(countProseWords(VI_PARAGRAPH));
  });

  it("văn bản tiếng Anh giữ 1 token = 1 từ", () => {
    const english =
      "The platform team noticed that the write queue backed up whenever a patch shipped on Friday afternoon, and nobody owned the rollback path for that service.";
    expect(countProseWords(english)).toBe(countProseSyllables(english));
  });

  it("chuỗi rỗng trả về 0", () => {
    expect(countProseWords("")).toBe(0);
    expect(countProseWords(null)).toBe(0);
  });
});

describe("cleanWordBounds", () => {
  it("sàn bám sát target sau khi siết", () => {
    const prefs = { targetWordCount: 1400, avoidFormatsText: "" };
    const bounds = cleanWordBounds(prefs, "blog");
    expect(bounds.target).toBe(1400);
    expect(bounds.minWords).toBe(1190);
    expect(bounds.aimWords).toBe(1330);
    expect(bounds.maxWords).toBeGreaterThan(1400);
  });

  it("social nới sàn hơn long-form", () => {
    const prefs = { targetWordCount: 200, avoidFormatsText: "" };
    const social = cleanWordBounds(prefs, "facebook");
    const blog = cleanWordBounds(prefs, "blog");
    expect(social.minWords).toBeLessThan(blog.minWords);
  });
});

describe("wordsToSyllables", () => {
  it("1400 từ nằm trong khoảng 2200-2400 tiếng", () => {
    const syllables = wordsToSyllables(1400);
    expect(syllables).toBeGreaterThanOrEqual(2200);
    expect(syllables).toBeLessThanOrEqual(2400);
  });
});
