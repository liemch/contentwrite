import { WorkflowState } from "@/generated/prisma/client";

export const ONBOARDING_STORAGE_KEY = "tfes-onboarding-v1";

export type OnboardingStep = {
  id: "create" | "run" | "review" | "publish";
  label: string;
  hint: string;
  href: string;
  done: boolean;
};

export type OnboardingArticleRow = {
  id: string;
  workflowState: WorkflowState;
};

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
  const hasRunning = articles.some((a) => RUNNING_STATES.has(a.workflowState));
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

export const SAMPLE_TOPICS_BY_DOMAIN: Record<string, string[]> = {
  engineering: [
    "Khi code review trở thành nút thắt cổ chai của team 8 người",
    "Vì sao estimate sprint hay lệch 30–50% dù đã có velocity",
  ],
  "soft-skills": [
    "Feedback khó nghe nhưng vẫn giữ trust — 3 cách nói cụ thể",
    "Họp 1:1 hiệu quả khi IC không muốn 'báo cáo'",
  ],
  product: [
    "Feature parity không cứu được sản phẩm B2B khi onboarding > 2 tuần",
    "Khi roadmap quý bị phá vì bug P0 liên tiếp",
  ],
  "ai-ml": [
    "Prompt engineering không thay thế được eval set thật",
    "RAG hay trả lời đúng nhưng sai ngữ cảnh nghiệp vụ",
  ],
  security: [
    "Zero trust trên giấy vs thực tế team remote 40 người",
    "Incident response khi log retention chỉ 7 ngày",
  ],
  fun: [
    "Game design: vì sao tutorial 5 phút vẫn làm 40% user bỏ cuộc",
  ],
  "new-tech": [
    "Edge compute hấp dẫn nhưng chi phí ẩn ở observability",
  ],
  lifestyle: [
    "Thói quen đọc sách khi lịch họp chiếm 6h/ngày",
  ],
};
