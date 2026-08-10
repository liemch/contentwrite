import { describe, expect, it } from "vitest";
import {
  PUBLISH_FORMAT_IDS,
  PUBLISH_FORMATS,
  formatPublishShapePrompt,
  resolvePublishFormat,
  resolveShapeForArticle,
} from "@/lib/tfes/publish-formats";
import { ARTICLE_SHAPES } from "@/lib/tfes/article-shapes";
import { assertCleanPublishQuality, cleanWordBounds } from "@/lib/tfes/quality";
import { countProseWords } from "@/lib/tfes/word-count";

describe("publish formats", () => {
  it("registers facebook, linkedin, newsletter with locked shapes", () => {
    expect(PUBLISH_FORMAT_IDS).toContain("facebook");
    expect(PUBLISH_FORMAT_IDS).toContain("linkedin");
    expect(PUBLISH_FORMAT_IDS).toContain("newsletter");
    expect(PUBLISH_FORMATS.facebook.lockShape).toBe("facebook-post");
    expect(PUBLISH_FORMATS.linkedin.lockShape).toBe("linkedin-post");
    expect(PUBLISH_FORMATS.newsletter.lockShape).toBe("newsletter");
    expect(ARTICLE_SHAPES["facebook-post"]).toBeTruthy();
    expect(ARTICLE_SHAPES["linkedin-post"]).toBeTruthy();
    expect(ARTICLE_SHAPES.newsletter).toBeTruthy();
  });

  it("injects PUBLISH_VOICE and CLEAN_STRUCTURE into shape prompt", () => {
    const block = formatPublishShapePrompt({
      articleId: "art-1",
      publishFormat: "facebook",
    });
    expect(block).toContain("### PUBLISH_FORMAT");
    expect(block).toContain("`facebook`");
    expect(block).toContain("### PUBLISH_VOICE");
    expect(block).toContain("### CLEAN_STRUCTURE");
    expect(block).toContain("facebook-post");
  });

  it("locks shape for structured and social formats", () => {
    expect(
      resolveShapeForArticle({ articleId: "x", publishFormat: "adr" }).id,
    ).toBe("adr");
    expect(
      resolveShapeForArticle({ articleId: "x", publishFormat: "facebook" }).id,
    ).toBe("facebook-post");
  });

  it("uses lower word floor for facebook vs blog", () => {
    const fb = cleanWordBounds({ targetWordCount: 175, avoidFormatsText: "table" }, "facebook");
    const blog = cleanWordBounds({ targetWordCount: 750, avoidFormatsText: "table" }, "blog");
    expect(fb.minWords).toBeLessThan(blog.minWords);
    expect(fb.minWords).toBeGreaterThanOrEqual(PUBLISH_FORMATS.facebook.wordFloor);
  });

  it("skips blog-only quality gates for facebook short post", () => {
    const body = `# Hook ngắn

Feed đang thưởng drama hơn chất lượng — đó là lý do post “thật” vẫn phải diễn một chút để được thuật toán nhìn thấy.

Một ví dụ gần: creator nói “mình nói thật” đúng lúc tương tác tăng; khán giả cười vì biết đó vẫn là phần của show. Mang đi được: hỏi rõ mình đang giải trí hay đang tin trước khi share tiếp.

CTA: bạn còn đuổi trend nào giữa chừng tuần này, và vì sao dừng?`;
    expect(countProseWords(body)).toBeGreaterThanOrEqual(
      PUBLISH_FORMATS.facebook.wordFloor,
    );
    expect(() =>
      assertCleanPublishQuality(
        body,
        { targetWordCount: 60, avoidFormatsText: "table" },
        "facebook",
      ),
    ).not.toThrow();
  });

  it("still requires concrete scene for blog", () => {
    const body = `# Tiêu đề

*Phụ đề nghiêng*

Trong môi trường ngày càng phức tạp, các biện pháp sau cần được áp dụng để tối ưu quy trình.
`;
    expect(() =>
      assertCleanPublishQuality(
        body,
        { targetWordCount: 1200, avoidFormatsText: "table" },
        "blog",
      ),
    ).toThrow();
  });

  it("resolvePublishFormat falls back to blog", () => {
    expect(resolvePublishFormat("nope").id).toBe("blog");
  });
});
