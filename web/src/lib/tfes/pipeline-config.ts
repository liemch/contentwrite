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
    /** Reader Simulation — bản sạch clip (thấp hơn review vì đã là bản đăng) */
    readerSimDraftMinChars: 12_000,
    readerSimDraftMaxChars: 24_000,
    readerSimDraftCharsPerWord: 8,
  },

  /** Retry / vòng lặp */
  retries: {
    maxReaderSimRetries: 1,
    /** Client “Chạy ngay” auto-write — đủ để gần hết pipeline */
    autoWriteRunNowMaxSteps: 24,
    /** Soft-continue trên trang bài */
    articleSoftRetryHint: 16,
  },

  /** AI-TFES v2 behavior flags. Each controller rolls back independently. */
  aiTfesV2: {
    convergenceTelemetry: true,
    /** WP-V2-02 deterministic candidate retention. */
    bestCandidateLock: {
      enabled: true,
      /** Reject only when candidateScore < bestScore - epsilon. */
      epsilon: 0,
    },
    /** WP-V2-03 suppresses high-quality craft-only Final MINOR outcomes. */
    falseFinalMinorGuard: {
      enabled: true,
    },
    /** WP-V2-04 adds preservation constraints to MINOR full-draft remediation. */
    minorPreservePrompt: {
      enabled: true,
      version: "v2-rc1-minor-preserve-v1",
    },
    /** WP-V2-05 pauses post-revision auto-ack on regression/unreadable review. */
    regressionAutoAckBrake: {
      enabled: true,
    },
    /**
     * Section Patch Engine (WP-V2-07+): apply article-patch.v1 / claim-patch.v1
     * instead of full-draft regen when the model emits a valid patch.
     * Rollback: enabled=false → legacy full-draft parse.
     */
    sectionPatch: {
      enabled: true,
    },
    /** Collapse Insight Gate + Decision + Planning into insight-lock@2.0. */
    insightConsolidate: {
      enabled: true,
    },
    /** Full RC2 prompt architecture — Research → Draft → Editorial → Fact → Lock. */
    promptArchitecture: {
      enabled: true,
      editorialDiagnosisVersion: "2.0",
      minorRemediationVersion: "2.0",
      majorRemediationVersion: "2.0",
      rewriteRemediationVersion: "2.0",
      lockVerifierVersion: "2.0",
      researchPacketVersion: "2.0",
      factAuditVersion: "2.0",
      factRemediationVersion: "2.0",
      insightLockVersion: "2.0",
      draftGenerationVersion: "2.0",
      insightGateVersion: "2.0",
      editorialDecisionVersion: "2.0",
      publishRendererVersion: "2.0",
      publishPolishVersion: "2.0",
      publishExpansionVersion: "2.0",
      publishQualityRepairVersion: "2.0",
      humanPolishVersion: "2.0",
      heroBriefVersion: "2.0",
      readerAuditVersion: "2.0",
    },
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

export type AiTfesVersion = "v1.6" | "v2-rc1" | "v2-rc2";

export function activeAiTfesVersion(): AiTfesVersion {
  const flags = PIPELINE_CONFIG.aiTfesV2;
  if (flags.promptArchitecture.enabled) return "v2-rc2";
  return flags.bestCandidateLock.enabled ||
    flags.falseFinalMinorGuard.enabled ||
    flags.minorPreservePrompt.enabled ||
    flags.regressionAutoAckBrake.enabled
    ? "v2-rc1"
    : "v1.6";
}
