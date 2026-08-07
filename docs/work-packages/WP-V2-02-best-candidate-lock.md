# WP-V2-02 — Best Candidate Lock

**Status:** Implemented technically; flag disabled pending staged cohort
**Behavior change when flag is OFF:** None
**Prompt / model / threshold / retry / state-machine change:** None

## Goal

Retain the highest machine-readable Editorial candidate in the current remediation cycle.
A lower candidate can still be audited, but when the lock is enabled it cannot replace the
best active draft.

## Configuration

One source of truth:

`web/src/lib/tfes/pipeline-config.ts` → `PIPELINE_CONFIG.aiTfesV2.bestCandidateLock`

- `enabled`: defaults to `false` for staged rollout.
- `epsilon`: defaults to `0`.
- Regression rule: `candidateScore < bestScore - epsilon`.

Changing epsilon is a deployment configuration change. Its optimal value remains an A/B
hypothesis; WP-V2-02 does not claim that `0`, `2`, or `3` is optimal.

## Candidate and cycle model

A candidate is eligible only after machine-readable Editorial Review and must reference an
immutable `ARTICLE_DRAFT` artifact revision. Transition metadata records score, gate count,
decision, workflow version, review time, cycle id/anchor, and deployment version.

- `human-review-confirmed` starts a new budget and seeds it with the candidate just reviewed.
- `manual-draft-revision` starts a clean cycle; its draft is not best until Editorial Review.
- Rejected and malformed candidates remain in artifacts/transitions but cannot become best.
- Legacy reviewed candidates are reconstructed from Editorial transitions and their REVIEW
  artifact's `sourceRevision`.

## Runtime behavior

When enabled:

1. Editorial Review evaluates the current draft normally.
2. The deterministic controller compares it with the cycle best.
3. A regression or malformed reviewed candidate is rejected.
4. The immutable best artifact is restored to `Article.draft12`.
5. A promotion `ARTICLE_DRAFT` revision is appended so future artifact lineage points to the
   active best draft. The rejected draft and its REVIEW artifact remain immutable.
6. Candidate rejection still consumes the remediation attempt already spent generating it.
7. On exhaustion, the active draft is checked and the best is promoted if necessary.

Restore invalidates `factCheck`, `cleanPublish`, and `heroBrief`. Fact Check therefore reruns
against the active best draft, and a rejected candidate cannot flow into publishing.

If the referenced best artifact is unavailable, remediation is blocked before another LLM
call. A structured `best-candidate-lock-artifact-missing` transition is written and no active
draft mutation occurs. A restore failure found during review is also prevented from reaching
publish.

## Telemetry

Lock-aware `details.telemetry.convergence` rows add:

- `bestEditorialScore`
- `candidateEditorialScore`
- `candidateScoreDelta`
- `candidateRegression`
- `candidateRejected`
- `keptCandidateRevision`
- `rejectedCandidateRevision`
- `epsilon`
- `lockEnabled`
- `acceptedDespiteRegression`
- `bestRetainedAtExhaustion`
- `restoreStatus`

`details.candidateLock` keeps the richer candidate/best references and attempt-consumption
audit. No prompt or article body is written to telemetry.

## Metrics

The existing bounded remediation report adds `candidateLock`:

- candidate regression rate
- rejected regression count
- retained-best rate
- average rejected score delta
- exhaustion-with-best-retained rate

Lock denominators only include rows with explicit WP-V2-02 fields. Legacy rows are unknown,
not false or zero.

## Tests

- Pure accept/reject matrix: first, equal, +1, −1 with epsilon `0` and `2`.
- 85 → 63 → 56 retention trajectory.
- Human-confirmed seed and manual-recovery cycle reset.
- Malformed/missing candidate protection and flag-off compatibility.
- Source wiring for promotion, exhaustion retention, downstream invalidation, and preflight.
- Metrics fixtures with explicit legacy exclusion.
- No live AI or production database calls.

## Rollback

Set `PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.enabled` to `false`. Current accept-always behavior
resumes; additive artifacts and transition metadata remain valid audit history.
