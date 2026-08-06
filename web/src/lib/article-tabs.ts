export const ARTICLE_TAB_KEYS = [
  "clean",
  "research",
  "insight",
  "draft",
  "fact",
  "knowledge",
  "desk",
] as const;

export type ArticleTabKey = (typeof ARTICLE_TAB_KEYS)[number];

export function isArticleTabKey(key: string): key is ArticleTabKey {
  return (ARTICLE_TAB_KEYS as readonly string[]).includes(key);
}

export function resolveArticleTabKey(
  key: string,
  fallback: ArticleTabKey = "research",
): ArticleTabKey {
  return isArticleTabKey(key) ? key : fallback;
}

/** Final verification (9b) failures surface in Review / Knowledge tab. */
export function tabForFinalVerificationFailure(): ArticleTabKey {
  return "knowledge";
}
