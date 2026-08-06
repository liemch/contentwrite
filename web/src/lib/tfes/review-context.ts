/**
 * Ngân sách và lắp ghép context cho bước chấm (8) + Revision Remediation.
 *
 * Hai điểm gãy đã điều tra (docs/debug/revision-remediation-investigation.md):
 * - Reviewer bước 8 chỉ nhận 7.000 ký tự nháp → không đọc được References/Takeaways/Discussion.
 * - 9b append "## Final Verification (pipeline)" vào CUỐI knowledgeRecord, còn prompt remediation
 *   cắt 6.000 ký tự ĐẦU → đúng phần Required Revisions mới nhất bị bỏ đi.
 */
import { clipText, stripPipelineMarks } from "@/lib/tfes/parser";
import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

const FINAL_VERIFICATION_SECTION_RE =
  /\n*##\s*Final Verification \(pipeline\)\s*([\s\S]*?)(?=\n##\s*Reader Simulation|$)/i;

/** Trần ký tự nháp cấp cho reviewer — đủ đọc hết bài kể cả khi target lớn. */
export function reviewDraftClipChars(targetWordCount?: number | null): number {
  const { words, context } = PIPELINE_CONFIG;
  const target =
    targetWordCount && targetWordCount > 0 ? targetWordCount : words.defaultTarget;
  return Math.min(
    context.reviewDraftMaxChars,
    Math.max(
      context.reviewDraftMinChars,
      Math.round(target * context.reviewDraftCharsPerWord),
    ),
  );
}

/** Phần "## Final Verification (pipeline)" — feedback mới nhất của 9b. */
export function extractFinalVerification(
  knowledgeRecord: string | null | undefined,
): string {
  const match = (knowledgeRecord ?? "").match(FINAL_VERIFICATION_SECTION_RE);
  return stripPipelineMarks(match?.[1] ?? "").trim();
}

/** knowledgeRecord đã bỏ block 9b — tránh lặp lại nội dung đã đưa lên đầu prompt. */
export function withoutFinalVerification(
  knowledgeRecord: string | null | undefined,
): string {
  return (knowledgeRecord ?? "").replace(FINAL_VERIFICATION_SECTION_RE, "\n").trim();
}

/**
 * Feedback mới nhất cho Revision Remediation, đặt trước mọi context khác.
 * Trả về chuỗi rỗng nếu chưa có lý do trượt nào.
 */
export function buildRevisionFeedbackBlock(article: {
  errorMessage?: string | null;
  knowledgeRecord?: string | null;
}): string {
  const { context } = PIPELINE_CONFIG;
  const parts: string[] = [];

  const reason = (article.errorMessage ?? "").trim();
  if (reason) {
    parts.push(
      `### Lý do trượt lần gần nhất — BẮT BUỘC sửa đúng các điểm này\n${clipText(reason, context.revisionFailureReasonChars)}`,
    );
  }

  const finalVerification = extractFinalVerification(article.knowledgeRecord);
  if (finalVerification) {
    parts.push(
      `### Final Verification (9b) — Required Revisions mới nhất\n${clipText(finalVerification, context.revisionFinalVerificationChars)}`,
    );
  }

  return parts.join("\n\n");
}
