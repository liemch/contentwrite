export const MAX_REVISION_REMEDIATION_RETRIES = 3;
export const MAX_FINAL_VERIFICATION_FORMAT_RETRIES = 2;

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
