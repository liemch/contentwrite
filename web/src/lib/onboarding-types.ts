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
  workflowState: string;
};
