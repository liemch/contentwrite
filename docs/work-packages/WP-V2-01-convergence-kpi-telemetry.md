# WP-V2-01 — Convergence KPI Telemetry

**Status:** Implemented technically; production cohort pending
**Behavior change:** None
**Prompt / model / threshold / retry / state-machine change:** None

## Goal

Measure whether AI-TFES candidates converge across retries without introducing Best
Candidate Lock, Final guards, Patch Editing, or any other v2 behavior.

## Data model

No migration and no Prisma schema change. New observations are optional nested fields in
`WorkflowTransition.details.telemetry.convergence`.

The runtime writes best-effort convergence context. If the enrichment read fails, workflow
execution continues with unknown convergence fields; observability never controls state.

## Instrumented paths

- `editorial-review`
- `editorial-review-after-revision`
- `remediate-required-revision`
- `revision-remediation-exhausted`
- `final-verification`
- `final-verification-format-invalid`

## Reported KPIs

- Editorial score monotonicity rate
- Average Editorial score delta
- Candidate regression rate
- Final regression rate
- Average Final score delta
- Retry convergence rate
- Rewrite count and average rewrite count/article

All denominators are emitted under `metrics.denominators`.

## Backward compatibility

- Existing telemetry fields remain unchanged.
- `convergence` is optional.
- The report derives KPIs from chronological actions + legacy `totalScore`, so old runs
  remain reportable.
- Missing score pairs produce `null`, not false success.

## Tests

- Pure convergence serialization/direction/regression tests.
- Remediation telemetry nesting test.
- Cohort aggregation fixtures reproducing 85 → 63 → 56.
- Wiring tests assert observation-only integration and report fields.
- No live AI calls or production database access.

## Rollback

Remove/disable convergence enrichment and ignore the additive report section. Existing
workflow transitions and all prior WP2.7 metrics remain valid.

## Production validation

Use the existing bounded cohort report. Do not declare WP-V2-02 ready solely because data
exists; first confirm denominators and score ordering on real trajectories.
