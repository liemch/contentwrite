import { describe, expect, it } from "vitest";
import {
  ARTICLE_TAB_GROUPS,
  ARTICLE_TAB_KEYS,
  defaultTabInGroup,
  isArticleTabKey,
  resolveArticleTabKey,
  resolveTabFromGroup,
  tabForFinalVerificationFailure,
  tabGroupForTab,
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

describe("article tab groups", () => {
  it("maps every legacy tab to one of four groups", () => {
    expect(ARTICLE_TAB_GROUPS).toHaveLength(4);
    expect(tabGroupForTab("clean")).toBe("read");
    expect(tabGroupForTab("research")).toBe("compose");
    expect(tabGroupForTab("fact")).toBe("verify");
    expect(tabGroupForTab("desk")).toBe("edit");
  });

  it("resolves sub-tabs within a group", () => {
    expect(resolveTabFromGroup("compose", "draft")).toBe("draft");
    expect(defaultTabInGroup("verify")).toBe("fact");
  });
});
