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

export const ARTICLE_TAB_GROUPS = [
  {
    key: "read",
    label: "Bản sạch",
    desc: "Bài đọc liền để đăng",
    tabs: ["clean"] as const,
  },
  {
    key: "compose",
    label: "Soạn",
    desc: "Research → Insight → Draft",
    tabs: ["research", "insight", "draft"] as const,
  },
  {
    key: "verify",
    label: "Kiểm tra",
    desc: "Fact-check & Review AI",
    tabs: ["fact", "knowledge"] as const,
  },
  {
    key: "edit",
    label: "Biên tập",
    desc: "Tóm tắt & duyệt",
    tabs: ["desk"] as const,
  },
] as const;

export type ArticleTabGroupKey = (typeof ARTICLE_TAB_GROUPS)[number]["key"];

const TAB_TO_GROUP = new Map<ArticleTabKey, ArticleTabGroupKey>(
  ARTICLE_TAB_GROUPS.flatMap((group) =>
    group.tabs.map((tab) => [tab, group.key] as const),
  ),
);

const GROUP_DEFAULT_TAB = new Map<ArticleTabGroupKey, ArticleTabKey>(
  ARTICLE_TAB_GROUPS.map((group) => [group.key, group.tabs[0]] as const),
);

export function isArticleTabKey(key: string): key is ArticleTabKey {
  return (ARTICLE_TAB_KEYS as readonly string[]).includes(key);
}

export function isArticleTabGroupKey(key: string): key is ArticleTabGroupKey {
  return ARTICLE_TAB_GROUPS.some((group) => group.key === key);
}

export function resolveArticleTabKey(
  key: string,
  fallback: ArticleTabKey = "research",
): ArticleTabKey {
  return isArticleTabKey(key) ? key : fallback;
}

export function tabGroupForTab(tab: ArticleTabKey): ArticleTabGroupKey {
  return TAB_TO_GROUP.get(tab) ?? "compose";
}

export function defaultTabInGroup(group: ArticleTabGroupKey): ArticleTabKey {
  return GROUP_DEFAULT_TAB.get(group) ?? "research";
}

export function resolveTabFromGroup(
  groupKey: string,
  subTab?: string | null,
  fallback: ArticleTabKey = "research",
): ArticleTabKey {
  if (!isArticleTabGroupKey(groupKey)) {
    return resolveArticleTabKey(subTab ?? groupKey, fallback);
  }
  const group = ARTICLE_TAB_GROUPS.find((item) => item.key === groupKey);
  if (!group) return fallback;
  if (subTab && isArticleTabKey(subTab) && (group.tabs as readonly string[]).includes(subTab)) {
    return subTab;
  }
  return group.tabs[0];
}

/** Final verification (9b) failures surface in Review / Knowledge tab. */
export function tabForFinalVerificationFailure(): ArticleTabKey {
  return "knowledge";
}

export const ARTICLE_SUBTAB_LABELS: Record<ArticleTabKey, string> = {
  clean: "Bản sạch",
  research: "Nghiên cứu",
  insight: "Cổng Insight",
  draft: "Bản nháp",
  fact: "Fact-check",
  knowledge: "Review",
  desk: "Tóm biên tập",
};
