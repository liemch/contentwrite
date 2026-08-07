# WP-V2-05 — Regression Auto-ack Brake

**Status:** Implemented technically; flag OFF pending Preview validation
**Behavior flag:** `PIPELINE_CONFIG.aiTfesV2.regressionAutoAckBrake.enabled`

## Rule

For post-revision Editorial Review, the deterministic brake uses the WP-V2-02 comparison:

- regression beyond Candidate Lock epsilon → suppress auto-ack;
- equal, improved, or a decline within epsilon → preserve current auto-ack;
- unreadable/missing candidate score → fail safe to Human Review.

The brake adds the existing Human Review pending marker; it does not add a workflow state.
The current remediation attempt remains consumed.

## Candidate Lock interaction

When Candidate Lock is ON, a rejected regression has already restored/promoted best before
Human Review. The observed 85 → 63 path therefore pauses with 85 active.

When Candidate Lock is OFF, the brake still pauses progression but does not claim restoration;
the current candidate remains active for explicit Human Review. This is safe against automatic
63 → 56 progression but cannot provide best retention by itself.

Human confirmation and `manual-draft-revision` remain the existing intervention/recovery paths,
including current remediation-cycle anchor behavior.

## Telemetry and metrics

`telemetry.autoAckBrake` records eligibility, suppression, scores, delta, epsilon, brake state,
reason, and whether Human Review was triggered.

The report emits suppression, interrupted-loop, human-intervention-after-brake, and
completion-after-brake rates with explicit denominators.

## Rollback and tests

Flag OFF preserves legacy auto-ack. Tests cover 85→63, 85→85, 85→86, epsilon `2` with 85→84,
malformed score, first review, flag OFF, Candidate Lock interaction, and RC trajectory wiring.
