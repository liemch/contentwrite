export type ConvergenceObservation = "editorial" | "final" | "rewrite";
export type ScoreDirection = "improved" | "flat" | "declined" | "unknown";

export type ConvergenceTelemetry = {
  observation: ConvergenceObservation;
  currentScore: number | null;
  previousEditorialScore: number | null;
  scoreDelta: number | null;
  scoreDirection: ScoreDirection;
  /** A post-revision candidate scored below the previous Editorial candidate. */
  candidateRegression: boolean | null;
  /** Final Verification scored below the latest Editorial candidate. */
  finalRegression: boolean | null;
  /** Non-decreasing Editorial score after a rewrite; quality pass is reported separately. */
  retryConverging: boolean | null;
  /** Lifetime full-draft revision remediations in the workflow run. */
  rewriteCount: number | null;
  /** WP-V2-02 fields exist only on lock-aware rows; legacy rows remain distinguishable. */
  bestEditorialScore?: number | null;
  candidateEditorialScore?: number | null;
  candidateScoreDelta?: number | null;
  candidateRejected?: boolean;
  keptCandidateRevision?: number | null;
  rejectedCandidateRevision?: number | null;
  epsilon?: number;
  lockEnabled?: boolean;
  acceptedDespiteRegression?: boolean;
  bestRetainedAtExhaustion?: boolean | null;
  restoreStatus?: "not-needed" | "restored" | "missing-artifact" | "disabled";
};

export type ConvergenceTelemetryInput = {
  observation: ConvergenceObservation;
  currentScore?: number | null;
  previousEditorialScore?: number | null;
  isPostRevisionReview?: boolean;
  rewriteCount?: number | null;
  candidateLock?: {
    bestEditorialScore: number | null;
    candidateEditorialScore: number | null;
    candidateScoreDelta: number | null;
    candidateRegression: boolean | null;
    candidateRejected: boolean;
    keptCandidateRevision: number | null;
    rejectedCandidateRevision: number | null;
    epsilon: number;
    lockEnabled: boolean;
    acceptedDespiteRegression: boolean;
    bestRetainedAtExhaustion?: boolean | null;
    restoreStatus?: "not-needed" | "restored" | "missing-artifact" | "disabled";
  };
};

function safeScore(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeCount(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function readTelemetryScore(details: unknown): number | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const telemetry = (details as { telemetry?: unknown }).telemetry;
  if (!telemetry || typeof telemetry !== "object" || Array.isArray(telemetry)) return null;
  return safeScore((telemetry as { totalScore?: unknown }).totalScore as number | null);
}

/** Pure WP-V2-01 observation builder. It must never decide or mutate workflow state. */
export function buildConvergenceTelemetry(
  input: ConvergenceTelemetryInput,
): ConvergenceTelemetry {
  const currentScore = safeScore(input.currentScore);
  const previousEditorialScore = safeScore(input.previousEditorialScore);
  const scoreDelta =
    currentScore !== null && previousEditorialScore !== null
      ? currentScore - previousEditorialScore
      : null;
  const scoreDirection: ScoreDirection =
    scoreDelta === null
      ? "unknown"
      : scoreDelta > 0
        ? "improved"
        : scoreDelta < 0
          ? "declined"
          : "flat";
  const comparable = scoreDelta !== null;
  const postRevisionEditorial =
    input.observation === "editorial" && input.isPostRevisionReview === true;

  const base: ConvergenceTelemetry = {
    observation: input.observation,
    currentScore,
    previousEditorialScore,
    scoreDelta,
    scoreDirection,
    candidateRegression: postRevisionEditorial && comparable ? scoreDelta < 0 : null,
    finalRegression:
      input.observation === "final" && comparable ? scoreDelta < 0 : null,
    retryConverging: postRevisionEditorial && comparable ? scoreDelta >= 0 : null,
    rewriteCount: safeCount(input.rewriteCount),
  };
  if (!input.candidateLock) return base;
  return {
    ...base,
    bestEditorialScore: safeScore(input.candidateLock.bestEditorialScore),
    candidateEditorialScore: safeScore(input.candidateLock.candidateEditorialScore),
    candidateScoreDelta:
      typeof input.candidateLock.candidateScoreDelta === "number" &&
      Number.isFinite(input.candidateLock.candidateScoreDelta)
        ? Math.round(input.candidateLock.candidateScoreDelta)
        : null,
    candidateRegression: input.candidateLock.candidateRegression,
    candidateRejected: input.candidateLock.candidateRejected,
    keptCandidateRevision: safeCount(input.candidateLock.keptCandidateRevision),
    rejectedCandidateRevision: safeCount(input.candidateLock.rejectedCandidateRevision),
    epsilon: Math.max(0, input.candidateLock.epsilon),
    lockEnabled: input.candidateLock.lockEnabled,
    acceptedDespiteRegression: input.candidateLock.acceptedDespiteRegression,
    ...(input.candidateLock.bestRetainedAtExhaustion !== undefined
      ? {
          bestRetainedAtExhaustion:
            input.candidateLock.bestRetainedAtExhaustion,
        }
      : {}),
    ...(input.candidateLock.restoreStatus
      ? { restoreStatus: input.candidateLock.restoreStatus }
      : {}),
  };
}
