# WP-V2-03 — False Final MINOR Guard

**Status:** Implemented technically; flag OFF pending Preview validation
**Behavior flag:** `PIPELINE_CONFIG.aiTfesV2.falseFinalMinorGuard.enabled`

## Rule

The deterministic guard only suppresses `MINOR_REVISION_REQUIRED` when:

- the latest applicable Editorial Review passed;
- Editorial score is at least the current threshold (`85`) and gate failures are `0`;
- Fact Check, Final gates, and insight floor pass;
- blocking claims and open required actions are `0`;
- Final output is machine-readable; and
- every parsed Required Revision is explicitly craft-only.

Blocking evidence/fact/source/claim/logic residuals, unknown residual text, missing Required
Revisions, malformed output, low insight, failed gates, or non-MINOR decisions fail safe to
legacy behavior.

## Suppression

When eligible and enabled, Final transitions to the existing `FINAL_REVIEWED` near-miss path.
The current draft and artifacts are unchanged, and no revision remediation is created.

## Telemetry and metrics

`telemetry.finalMinorGuard` records eligibility, suppression, reason class, Final/Editorial
scores, Fact status, blocking residual count, and flag state.

The report emits eligible rate, enabled suppression rate, post-suppression lock rate, and
later human-correction rate with explicit denominators.

## Rollback and tests

Flag OFF observes eligibility but never suppresses. Unit tests cover craft-only 85, OFF,
Fact/gate/insight failures, blocking residuals, MAJOR/REWRITE, unknown residuals, and malformed
output. RC integration tests verify the observed 85 → Fact PASS → Final 85 craft-MINOR chain.
