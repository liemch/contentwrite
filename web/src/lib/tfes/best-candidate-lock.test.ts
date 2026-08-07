import { describe, expect, it } from "vitest";
import {
  candidatesInCurrentCycle,
  evaluateCandidateLock,
  selectBestCandidate,
  type BestCandidateReference,
} from "@/lib/tfes/best-candidate-lock";

function candidate(
  editorialScore: number,
  draftRevision: number,
  reviewedAt = `2026-08-07T00:00:0${draftRevision}.000Z`,
): BestCandidateReference {
  return {
    draftRevision,
    editorialScore,
    gateFailCount: 0,
    decision: "PASS",
    workflowVersion: draftRevision,
    reviewedAt,
    cycleId: "workflow-run:start",
    cycleAnchorAction: null,
    deploymentVersion: "abc1234",
  };
}

describe("WP-V2-02 best candidate controller", () => {
  it("promotes the first reviewed candidate, ties, and higher scores", () => {
    const first = candidate(85, 1);
    expect(
      evaluateCandidateLock({
        config: { enabled: true, epsilon: 0 },
        bestBefore: null,
        candidate: first,
        machineReadable: true,
      }).bestAfter,
    ).toEqual(first);

    const tied = evaluateCandidateLock({
      config: { enabled: true, epsilon: 0 },
      bestBefore: first,
      candidate: candidate(85, 2),
      machineReadable: true,
    });
    expect(tied).toMatchObject({
      candidateRegression: false,
      candidateRejected: false,
      bestAfter: first,
    });

    const improved = evaluateCandidateLock({
      config: { enabled: true, epsilon: 0 },
      bestBefore: first,
      candidate: candidate(86, 3),
      machineReadable: true,
    });
    expect(improved).toMatchObject({
      candidateScoreDelta: 1,
      candidateRejected: false,
      bestAfter: candidate(86, 3),
    });
  });

  it("rejects -1 at epsilon 0 but accepts it at epsilon 2", () => {
    const best = candidate(85, 1);
    expect(
      evaluateCandidateLock({
        config: { enabled: true, epsilon: 0 },
        bestBefore: best,
        candidate: candidate(84, 2),
        machineReadable: true,
      }),
    ).toMatchObject({
      candidateScoreDelta: -1,
      candidateRegression: true,
      candidateRejected: true,
      acceptedDespiteRegression: false,
    });
    expect(
      evaluateCandidateLock({
        config: { enabled: true, epsilon: 2 },
        bestBefore: best,
        candidate: candidate(84, 2),
        machineReadable: true,
      }),
    ).toMatchObject({
      candidateScoreDelta: -1,
      candidateRegression: false,
      candidateRejected: false,
      acceptedDespiteRegression: true,
      bestAfter: best,
    });
  });

  it("retains 85 through the 85 -> 63 -> 56 exhausted trajectory", () => {
    let best: BestCandidateReference | null = null;
    let active: BestCandidateReference | null = null;
    for (const item of [candidate(85, 1), candidate(63, 2), candidate(56, 3)]) {
      const result = evaluateCandidateLock({
        config: { enabled: true, epsilon: 0 },
        bestBefore: best,
        candidate: item,
        machineReadable: true,
      });
      best = result.bestAfter;
      active = result.candidateRejected ? result.bestAfter : item;
      if (item.draftRevision > 1) expect(result.candidateRejected).toBe(true);
      if (item.draftRevision > 1) expect(active?.editorialScore).toBe(85);
    }
    expect(best).toMatchObject({ editorialScore: 85, draftRevision: 1 });
    expect(active).toMatchObject({ editorialScore: 85, draftRevision: 1 });
  });

  it("does not promote malformed or artifact-less candidates", () => {
    const best = candidate(85, 1);
    expect(
      evaluateCandidateLock({
        config: { enabled: true, epsilon: 0 },
        bestBefore: best,
        candidate: candidate(90, 2),
        machineReadable: false,
      }),
    ).toMatchObject({
      candidateEligible: false,
      candidateRejected: true,
      bestAfter: best,
      reason: "malformed-review",
    });
    expect(
      evaluateCandidateLock({
        config: { enabled: true, epsilon: 0 },
        bestBefore: best,
        candidate: null,
        machineReadable: true,
      }),
    ).toMatchObject({
      candidateEligible: false,
      candidateRejected: true,
      bestAfter: best,
      reason: "missing-candidate-artifact",
    });
  });

  it("keeps legacy behavior while the feature flag is off", () => {
    expect(
      evaluateCandidateLock({
        config: { enabled: false, epsilon: 0 },
        bestBefore: candidate(85, 1),
        candidate: candidate(63, 2),
        machineReadable: true,
      }),
    ).toMatchObject({
      candidateRegression: true,
      candidateRejected: false,
      acceptedDespiteRegression: true,
      reason: "lock-disabled",
    });
  });

  it("seeds human-confirmed cycles but resets candidates after manual recovery", () => {
    const before = candidate(85, 1, "2026-08-07T00:00:01.000Z");
    const after = candidate(63, 2, "2026-08-07T00:00:03.000Z");
    expect(
      candidatesInCurrentCycle([before, after], [
        {
          action: "human-review-confirmed",
          createdAt: "2026-08-07T00:00:02.000Z",
        },
      ]),
    ).toEqual([before, after]);
    expect(
      candidatesInCurrentCycle([before, after], [
        {
          action: "manual-draft-revision",
          createdAt: "2026-08-07T00:00:02.000Z",
        },
      ]),
    ).toEqual([after]);
    expect(selectBestCandidate([before, after])).toEqual(before);
  });
});
