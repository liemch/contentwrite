export const MAX_REVISION_REMEDIATION_RETRIES = 3;

export function isRevisionRemediationExhausted(
  errorMessage: string | null | undefined,
): boolean {
  return /Revision chưa đạt sau \d+ lần remediation/i.test(errorMessage ?? "");
}
