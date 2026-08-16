import { WorkflowState } from "@/generated/prisma/client";
import type { OnboardingArticleRow, OnboardingStep } from "@/lib/onboarding-types";

export type { OnboardingStep } from "@/lib/onboarding-types";

const RUNNING_STATES = new Set<WorkflowState>([
  WorkflowState.RESEARCHED,
  WorkflowState.SYNTHESIZED,
  WorkflowState.INSIGHT_APPROVED,
  WorkflowState.DECIDED,
  WorkflowState.PLANNED,
  WorkflowState.DRAFTED,
  WorkflowState.EDITORIAL_REVIEWED,
  WorkflowState.FACT_CHECKED,
  WorkflowState.FINAL_REVIEWED,
  WorkflowState.POLISHED,
  WorkflowState.READER_SIMULATED,
  WorkflowState.PUBLISH_READY,
  WorkflowState.APPROVED,
  WorkflowState.PUBLISHED,
]);

export function buildOnboardingSteps(articles: OnboardingArticleRow[]): OnboardingStep[] {
  const hasArticle = articles.length > 0;
  const hasRunning = articles.some((a) =>
    RUNNING_STATES.has(a.workflowState as WorkflowState),
  );
  const hasReview = articles.some(
    (a) =>
      a.workflowState === WorkflowState.PUBLISH_READY ||
      a.workflowState === WorkflowState.APPROVED ||
      a.workflowState === WorkflowState.PUBLISHED,
  );
  const hasPublished = articles.some((a) => a.workflowState === WorkflowState.PUBLISHED);
  const firstId = articles[0]?.id;

  return [
    {
      id: "create",
      label: "Tạo bài đầu tiên",
      hint: "Chỉ cần chủ đề + lĩnh vực",
      href: "/articles/new",
      done: hasArticle,
    },
    {
      id: "run",
      label: "Chạy chu trình AI",
      hint: "Giữ tab mở ~15–30 phút",
      href: firstId ? `/articles/${firstId}?autorun=1` : "/articles/new",
      done: hasRunning,
    },
    {
      id: "review",
      label: "Review & duyệt",
      hint: "Xác nhận Review AI rồi Approve",
      href: firstId ? `/articles/${firstId}` : "/dashboard",
      done: hasReview,
    },
    {
      id: "publish",
      label: "Publish vào Thư viện",
      hint: "Bài xong sẽ hiện ở Thư viện",
      href: "/library",
      done: hasPublished,
    },
  ];
}
