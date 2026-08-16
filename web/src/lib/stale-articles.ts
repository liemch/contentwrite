import { WorkflowState } from "@/generated/prisma/client";

const STALE_MS = 30 * 60 * 1000;

const TERMINAL_STATES = new Set<WorkflowState>([
  WorkflowState.PUBLISH_READY,
  WorkflowState.APPROVED,
  WorkflowState.PUBLISHED,
  WorkflowState.CORRECTION_REQUIRED,
  WorkflowState.RETRACTED,
  WorkflowState.INSIGHT_REJECTED,
]);

export type StaleArticleRow = {
  id: string;
  title: string | null;
  topic: string | null;
  workflowState: WorkflowState;
  currentStep: string | null;
  updatedAt: Date;
};

export function findStaleArticles(
  articles: StaleArticleRow[],
  now = Date.now(),
  thresholdMs = STALE_MS,
): StaleArticleRow[] {
  return articles.filter((article) => {
    if (!article.currentStep) return false;
    if (TERMINAL_STATES.has(article.workflowState)) return false;
    return now - article.updatedAt.getTime() > thresholdMs;
  });
}

export function staleMinutes(article: StaleArticleRow, now = Date.now()): number {
  return Math.floor((now - article.updatedAt.getTime()) / 60_000);
}
