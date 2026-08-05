/**
 * Runtime contract registry. Keep versioned policy out of the executor so a v1.7
 * upgrade can introduce a new contract without scattering magic values.
 */
export const TFES_CONTRACT = {
  operatingPromptVersion: "1.6",
  artifactSchemaVersion: "1.0",
  finalReview: {
    /** Pass band lý tưởng: ≥90 (trước đây 95 — quá chặt). */
    minimumTotalScore: 90,
    /**
     * Grace band: ≥87 + đủ gate/fact/0 open action → chấp nhận FINAL_REVIEWED.
     * Runtime chấp nhận near-miss khi gate khác OK; prompt vẫn ưu tiên chấm ≥90.
     */
    nearMissAcceptFloor: 87,
    minimumInsightScore: 22,
    requiredGateCount: 8,
  },
  /** Bước 8 — bài chỉ được EDITORIAL_REVIEWED khi gần bar 9b (provisional). */
  editorialReview: {
    minimumTotalScore: 85,
    minimumInsightScore: 20,
  },
  research: {
    minimumIndependentLineages: 3,
    requireCounterPerspective: true,
    requireIndependentNonVendorSource: true,
  },
  freshnessReviewDays: {
    engineering: 90,
    "ai-ml": 30,
    product: 60,
    security: 30,
    "soft-skills": 180,
  },
  correction: {
    initialVersion: "1.0.0",
    cosmeticBump: "patch",
    informationalBump: "minor",
    meaningBump: "major",
  },
} as const;

export type TfesContract = typeof TFES_CONTRACT;

export function bumpContentVersion(
  current: string | null | undefined,
  level: "patch" | "minor" | "major",
): string {
  const match = (current ?? "").match(/^(\d+)\.(\d+)\.(\d+)$/);
  const [major, minor, patch] = match
    ? [Number(match[1]), Number(match[2]), Number(match[3])]
    : [1, 0, 0];
  if (level === "major") return `${major + 1}.0.0`;
  if (level === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}
