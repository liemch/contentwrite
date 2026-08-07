import { WorkflowState } from "@/generated/prisma/enums";
import {
  CLEAN_POLISH_MARK,
  FINAL_REVIEW_DONE_MARK,
  READER_SIM_DONE_MARK,
  REVIEW_DONE_MARK,
} from "@/lib/tfes/parser";
import { isAwaitingHumanReview } from "@/lib/tfes/human-review";
import { isCleanPublishQualityFail } from "@/lib/tfes/quality";

export type FinalizePhase =
  | "review"
  | "await-human"
  | "revision-remediate"
  | "fact-remediate"
  | "fact"
  | "final-verify"
  | "publish"
  | "polish"
  | "reader-sim"
  | "done";

export type FinalizePhaseInput = {
  knowledgeRecord?: string | null;
  factCheck?: string | null;
  cleanPublish?: string | null;
  errorMessage?: string | null;
  workflowState?: WorkflowState;
};

export function finalizePhaseOf(article: FinalizePhaseInput): FinalizePhase {
  const kr = article.knowledgeRecord ?? "";
  const fc = article.factCheck ?? "";
  const clean = (article.cleanPublish ?? "").trim();
  const reviewDone = kr.includes(REVIEW_DONE_MARK) || Boolean(fc.trim());
  if (isAwaitingHumanReview(article)) return "await-human";
  if (
    article.workflowState === WorkflowState.MINOR_REVISION_REQUIRED ||
    article.workflowState === WorkflowState.MAJOR_REVISION_REQUIRED ||
    article.workflowState === WorkflowState.REWRITE_REQUIRED
  ) return "revision-remediate";
  if (!reviewDone) return "review";
  if (article.workflowState === WorkflowState.FACT_CHECK_FAILED) return "fact-remediate";
  if (!fc.trim()) return "fact";
  if (!kr.includes(FINAL_REVIEW_DONE_MARK)) return "final-verify";
  if (clean.length < 80) return "publish";
  // Reader Sim fail → polish lại kèm feedback
  if (article.errorMessage && /Reader Sim chưa đạt/i.test(article.errorMessage)) {
    return "polish";
  }
  if (article.errorMessage && isCleanPublishQualityFail(article.errorMessage)) {
    return "polish";
  }
  if (!clean.includes(CLEAN_POLISH_MARK)) return "polish";
  if (!kr.includes(READER_SIM_DONE_MARK)) return "reader-sim";
  return "done";
}
