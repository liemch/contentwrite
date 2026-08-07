export const MAX_REVISION_REMEDIATION_RETRIES = 3;
/** Gồm cả retry khi LLM dump điểm thoái hoá 0/0 — cần thêm lượt để chấm lại. */
export const MAX_FINAL_VERIFICATION_FORMAT_RETRIES = 3;
/**
 * Editorial Review format-only retries. Đếm tách khỏi
 * MAX_REVISION_REMEDIATION_RETRIES: output sai format là lỗi định dạng,
 * không phải lỗi nội dung, nên không được tiêu revision budget.
 */
export const MAX_EDITORIAL_REVIEW_FORMAT_RETRIES = 2;
/** UI soft-continue sau 9b score-fail — hết lượt thì dừng cho người xem. */
export const MAX_FINAL_VERIFICATION_SOFT_RETRIES = 2;

export function isRevisionRemediationExhausted(
  errorMessage: string | null | undefined,
): boolean {
  return /Revision chưa đạt sau \d+ lần remediation/i.test(errorMessage ?? "");
}

export function isFinalVerificationFormatExhausted(
  errorMessage: string | null | undefined,
): boolean {
  return /Final Verification sai định dạng sau \d+ lần/i.test(errorMessage ?? "");
}

export function isEditorialFormatExhausted(
  errorMessage: string | null | undefined,
): boolean {
  return /Editorial Review sai machine format sau \d+ lần/i.test(
    errorMessage ?? "",
  );
}
