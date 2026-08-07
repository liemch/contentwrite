import type { RemediationCycleAnchorAction } from "@/lib/tfes/remediation-budget";

export type BestCandidateReference = {
  draftRevision: number;
  editorialScore: number;
  gateFailCount: number | null;
  decision: string | null;
  workflowVersion: number | null;
  reviewedAt: string;
  cycleId: string;
  cycleAnchorAction: RemediationCycleAnchorAction | null;
  deploymentVersion: string | null;
};

export type CandidateLockConfig = {
  enabled: boolean;
  epsilon: number;
};

export type CandidateLockEvaluation = {
  lockEnabled: boolean;
  epsilon: number;
  candidateEligible: boolean;
  bestBefore: BestCandidateReference | null;
  bestAfter: BestCandidateReference | null;
  candidateScoreDelta: number | null;
  candidateRegression: boolean | null;
  candidateRejected: boolean;
  acceptedDespiteRegression: boolean;
  reason:
    | "first-reviewed-candidate"
    | "promoted-higher-score"
    | "accepted-equal-score"
    | "accepted-within-epsilon"
    | "lock-disabled"
    | "regression"
    | "malformed-review"
    | "missing-candidate-artifact";
};

export type CycleAnchor = {
  action: RemediationCycleAnchorAction;
  createdAt: Date | string;
};

function timestamp(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function cycleIdFor(anchor: CycleAnchor | null): string {
  return anchor
    ? `${anchor.action}:${new Date(timestamp(anchor.createdAt)).toISOString()}`
    : "workflow-run:start";
}

export function latestCycleAnchor(anchors: CycleAnchor[]): CycleAnchor | null {
  return anchors.reduce<CycleAnchor | null>(
    (latest, anchor) =>
      !latest || timestamp(anchor.createdAt) >= timestamp(latest.createdAt)
        ? anchor
        : latest,
    null,
  );
}

/**
 * Human confirmation seeds a cycle with the reviewed candidate immediately before it.
 * Manual recovery starts from an unreviewed draft, so old-cycle candidates are excluded.
 */
export function candidatesInCurrentCycle(
  candidates: BestCandidateReference[],
  anchors: CycleAnchor[],
): BestCandidateReference[] {
  const anchor = latestCycleAnchor(anchors);
  if (!anchor) return [...candidates];
  const anchorMs = timestamp(anchor.createdAt);
  const afterAnchor = candidates.filter(
    (candidate) => timestamp(candidate.reviewedAt) > anchorMs,
  );
  if (anchor.action === "manual-draft-revision") return afterAnchor;
  const seed = [...candidates]
    .filter((candidate) => timestamp(candidate.reviewedAt) <= anchorMs)
    .sort((a, b) => timestamp(b.reviewedAt) - timestamp(a.reviewedAt))[0];
  return seed ? [seed, ...afterAnchor] : afterAnchor;
}

export function selectBestCandidate(
  candidates: BestCandidateReference[],
): BestCandidateReference | null {
  return [...candidates].sort(
    (a, b) =>
      b.editorialScore - a.editorialScore ||
      timestamp(a.reviewedAt) - timestamp(b.reviewedAt),
  )[0] ?? null;
}

export function evaluateCandidateLock(input: {
  config: CandidateLockConfig;
  bestBefore: BestCandidateReference | null;
  candidate: BestCandidateReference | null;
  machineReadable: boolean;
}): CandidateLockEvaluation {
  const epsilon = Math.max(0, input.config.epsilon);
  const candidateEligible = Boolean(input.candidate && input.machineReadable);
  const best = input.bestBefore;
  const candidate = input.candidate;

  if (!candidateEligible || !candidate) {
    const reason = candidate ? "malformed-review" : "missing-candidate-artifact";
    return {
      lockEnabled: input.config.enabled,
      epsilon,
      candidateEligible: false,
      bestBefore: best,
      bestAfter: best,
      candidateScoreDelta: null,
      candidateRegression: null,
      candidateRejected: input.config.enabled && best !== null,
      acceptedDespiteRegression: false,
      reason,
    };
  }

  if (!best) {
    return {
      lockEnabled: input.config.enabled,
      epsilon,
      candidateEligible: true,
      bestBefore: null,
      bestAfter: candidate,
      candidateScoreDelta: null,
      candidateRegression: null,
      candidateRejected: false,
      acceptedDespiteRegression: false,
      reason: "first-reviewed-candidate",
    };
  }

  const delta = candidate.editorialScore - best.editorialScore;
  const regression = delta < -epsilon;
  const rejected = input.config.enabled && regression;
  const bestAfter = delta > 0 ? candidate : best;
  const reason: CandidateLockEvaluation["reason"] = !input.config.enabled
    ? "lock-disabled"
    : regression
      ? "regression"
      : delta > 0
        ? "promoted-higher-score"
        : delta === 0
          ? "accepted-equal-score"
          : "accepted-within-epsilon";

  return {
    lockEnabled: input.config.enabled,
    epsilon,
    candidateEligible: true,
    bestBefore: best,
    bestAfter,
    candidateScoreDelta: delta,
    candidateRegression: regression,
    candidateRejected: rejected,
    acceptedDespiteRegression: delta < 0 && !rejected,
    reason,
  };
}
