/**
 * Cấu hình quy trình pipeline AI-TFES (chỉnh tại đây khi cần tune).
 * Không nhét prompt dài vào Settings — prompt vẫn nằm ở content/ai-tfes + prompts.ts.
 * Các knobs hay đổi (số từ, retry, vòng auto) gom về file này để update một chỗ.
 */
export const PIPELINE_CONFIG = {
  version: 1,

  /** Số từ bản sạch */
  words: {
    defaultTarget: 1200,
    minTarget: 400,
    maxTarget: 2500,
    /** Sàn máy chấm = target × ratio */
    cleanMinRatio: 0.7,
    /** Dưới mức này → expand pass */
    cleanAimRatio: 0.85,
    cleanMaxRatio: 1.6,
    cleanMaxBuffer: 300,
  },

  /** Ngân sách context ký tự cho bước chấm (8) và Revision Remediation */
  context: {
    /** Sàn ký tự nháp cấp cho reviewer — phải đủ để đọc References/Takeaways/Discussion */
    reviewDraftMinChars: 16_000,
    reviewDraftMaxChars: 32_000,
    /** Nháp 12 phần dài hơn bản sạch — ước lượng ký tự/từ tiếng Việt kèm buffer */
    reviewDraftCharsPerWord: 9,
    reviewResearchBriefChars: 3_000,
    /** Required Revisions mới nhất từ 9b — đứng đầu prompt remediation */
    revisionFinalVerificationChars: 3_000,
    revisionFailureReasonChars: 700,
  },

  /** Retry / vòng lặp */
  retries: {
    maxReaderSimRetries: 1,
    /** Client “Chạy ngay” auto-write — đủ để gần hết pipeline */
    autoWriteRunNowMaxSteps: 24,
    /** Soft-continue trên trang bài */
    articleSoftRetryHint: 16,
  },

  /** Token gen bản sạch / polish / expand (trần API) */
  llm: {
    cleanMaxTokensCap: 16_384,
    cleanMaxTokensFloor: 8_000,
    /** ~token per Vietnamese word + reasoning buffer */
    cleanTokensPerWord: 5,
    cleanTokensExtra: 2_000,
  },
} as const;

export type PipelineConfig = typeof PIPELINE_CONFIG;
