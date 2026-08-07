/**
 * Lifetime remediation count stays in WorkflowTransition history forever.
 * The live retry budget is only the count inside the current recovery cycle.
 *
 * Cycle anchors open a fresh budget without deleting prior transitions:
 * - human-review-confirmed
 * - manual-draft-revision (WP2.7 exhausted recovery)
 */

export const REMEDIATION_CYCLE_ANCHOR_ACTIONS = [
  "human-review-confirmed",
  "manual-draft-revision",
] as const;

export type RemediationCycleAnchorAction =
  (typeof REMEDIATION_CYCLE_ANCHOR_ACTIONS)[number];

export type RemediationTransitionStamp = {
  action: string;
  createdAt: Date | string;
};

function stampTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function isRemediationCycleAnchor(action: string): boolean {
  return (REMEDIATION_CYCLE_ANCHOR_ACTIONS as readonly string[]).includes(action);
}

/** Latest cycle boundary, or null when the whole workflow run is still one cycle. */
export function latestRemediationCycleAnchor(
  transitions: RemediationTransitionStamp[],
): RemediationTransitionStamp | null {
  let latest: RemediationTransitionStamp | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const transition of transitions) {
    if (!isRemediationCycleAnchor(transition.action)) continue;
    const ms = stampTime(transition.createdAt);
    if (ms >= latestMs) {
      latest = transition;
      latestMs = ms;
    }
  }
  return latest;
}

export function countRemediationsInCurrentCycle(
  transitions: RemediationTransitionStamp[],
  remediationAction: string,
): {
  lifetimeCount: number;
  cycleCount: number;
  cycleAnchorAction: string | null;
  cycleStartedAt: Date | null;
} {
  const anchor = latestRemediationCycleAnchor(transitions);
  const cycleStartedAt = anchor ? new Date(stampTime(anchor.createdAt)) : null;
  const cycleStartedMs = cycleStartedAt?.getTime() ?? null;

  let lifetimeCount = 0;
  let cycleCount = 0;
  for (const transition of transitions) {
    if (transition.action !== remediationAction) continue;
    lifetimeCount += 1;
    if (cycleStartedMs == null || stampTime(transition.createdAt) > cycleStartedMs) {
      cycleCount += 1;
    }
  }

  return {
    lifetimeCount,
    cycleCount,
    cycleAnchorAction: anchor?.action ?? null,
    cycleStartedAt,
  };
}

export function isRemediationBudgetExhausted(
  cycleCount: number,
  maxAttempts: number,
): boolean {
  return cycleCount >= maxAttempts;
}
