import { describe, expect, it } from "vitest";
import {
  ARTICLE_TAB_KEYS,
  isArticleTabKey,
  resolveArticleTabKey,
  tabForFinalVerificationFailure,
} from "@/lib/article-tabs";

describe("article tab keys", () => {
  it("includes all pipeline tabs", () => {
    expect(ARTICLE_TAB_KEYS).toContain("knowledge");
    expect(ARTICLE_TAB_KEYS).not.toContain("review");
  });

  it("resolveArticleTabKey maps invalid keys to fallback", () => {
    expect(resolveArticleTabKey("review", "research")).toBe("research");
    expect(resolveArticleTabKey("knowledge")).toBe("knowledge");
  });

  it("isArticleTabKey guards valid keys", () => {
    expect(isArticleTabKey("draft")).toBe(true);
    expect(isArticleTabKey("review")).toBe(false);
  });

  it("final verification failure uses knowledge tab", () => {
    expect(tabForFinalVerificationFailure()).toBe("knowledge");
    expect(isArticleTabKey(tabForFinalVerificationFailure())).toBe(true);
  });
});
