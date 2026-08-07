import {
  FINAL_REVIEW_DONE_MARK,
  HUMAN_REVIEW_DONE_MARK,
  HUMAN_REVIEW_PENDING_MARK,
  POST_REVISION_REVIEW_MARK,
  READER_SIM_DONE_MARK,
  REVIEW_DONE_MARK,
  stripPipelineMarks,
  WRITE_DONE_MARK,
} from "@/lib/tfes/parser";
import { sanitizeEditorialBody } from "@/lib/publish-content";
import { isFactRemediationExhausted } from "@/lib/tfes/fact-ledger";
import { isRevisionRemediationExhausted } from "@/lib/tfes/retry-policy";

export function assertExpectedWorkflowVersion(current: number, expected: number): void {
  if (current !== expected) {
    throw new Error(`Workflow conflict: expected version ${expected}, got ${current}`);
  }
}

export function prepareManualDraftRecovery(input: {
  draftMarkdown: string;
  currentDraft: string | null;
  knowledgeRecord: string | null;
  factCheck: string | null;
  errorMessage: string | null;
  revisionAttempts: number;
  factAttempts: number;
}) {
  const revisionExhausted = isRevisionRemediationExhausted(input.errorMessage);
  const factExhausted = isFactRemediationExhausted(input.errorMessage);
  if (!revisionExhausted && !factExhausted) {
    throw new Error("Chỉ sửa draft recovery khi revision hoặc fact remediation đã exhausted");
  }

  const nextDraft = sanitizeEditorialBody(stripPipelineMarks(input.draftMarkdown));
  if (nextDraft.length < 80) {
    throw new Error("Cần gửi toàn bộ draft Markdown đã sửa (tối thiểu 80 ký tự)");
  }
  const retainedKnowledge = (input.knowledgeRecord ?? "")
    .replace(/\n+##\s*Final Verification \(pipeline\)[\s\S]*$/i, "")
    .replace(/\n+##\s*Reader Simulation[\s\S]*$/i, "")
    .replaceAll(FINAL_REVIEW_DONE_MARK, "")
    .replaceAll(READER_SIM_DONE_MARK, "")
    .replaceAll(REVIEW_DONE_MARK, "")
    .replaceAll(HUMAN_REVIEW_DONE_MARK, "")
    .replaceAll(HUMAN_REVIEW_PENDING_MARK, "")
    .replaceAll(POST_REVISION_REVIEW_MARK, "")
    .trim();

  return {
    nextDraft,
    articlePatch: {
      draft12: `${nextDraft}\n\n${WRITE_DONE_MARK}`,
      factCheck: null,
      knowledgeRecord: `${retainedKnowledge}\n\n${POST_REVISION_REVIEW_MARK}`.trim(),
      cleanPublish: null,
      heroBrief: null,
      errorMessage: null,
    },
    details: {
      checkpoint: "editorial-review",
      /** Lifetime history is preserved; only the live retry budget opens a new cycle. */
      countersReset: false,
      recoveryCycleBudgetReset: true,
      revisionAttempts: input.revisionAttempts,
      factAttempts: input.factAttempts,
      previousDraftCharacterLength: stripPipelineMarks(input.currentDraft).length,
      draftCharacterLength: nextDraft.length,
      invalidatedFactCheck: Boolean(input.factCheck?.trim()),
      invalidatedFinalReview: Boolean(
        input.knowledgeRecord?.includes(FINAL_REVIEW_DONE_MARK),
      ),
      remediationCount: revisionExhausted
        ? input.revisionAttempts
        : input.factAttempts,
    },
  };
}
