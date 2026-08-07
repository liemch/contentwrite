# AI-TFES v2 RC1

**Release candidate:** WP-V2-01 through WP-V2-05
**Default runtime behavior:** v1.6-compatible because all behavior flags default OFF

## Features

- Convergence KPI telemetry and version/config dimensions.
- Cycle-scoped Best Candidate Lock with immutable artifact promotion.
- False Final MINOR Guard for high-quality craft-only residuals.
- MINOR full-draft preservation prompt with optional section metadata.
- Regression Auto-ack Brake using the existing Human Review path.

No Section Patch, Final Delta, Typed Defects, split budgets, multi-agent design, schema redesign,
or retry/threshold/model change is included.

## Flags

All flags live in `PIPELINE_CONFIG.aiTfesV2`:

```text
convergenceTelemetry: true
bestCandidateLock.enabled: false
bestCandidateLock.epsilon: 0
falseFinalMinorGuard.enabled: false
minorPreservePrompt.enabled: false
regressionAutoAckBrake.enabled: false
```

Any behavior flag ON labels new telemetry `aiTfesVersion=v2-rc1`; all OFF labels it `v1.6`.
Telemetry also persists the exact flag exposure and epsilon.

## Metrics

The bounded report retains WP2.7/WP-V2-01 metrics and adds:

- revision convergence and manual recovery rates;
- candidate retention metrics;
- false Final MINOR eligibility/suppression/post-lock/human-correction rates;
- auto-ack suppression/interrupted-loop/human/completion rates;
- v1.6 versus v2-rc1 telemetry event counts.

Run the same bounded cohort separately with:

```bash
npm run db:report:remediation -- --manifest <cohort.json> --ai-tfes-version v1.6 --format json
npm run db:report:remediation -- --manifest <cohort.json> --ai-tfes-version v2-rc1 --format json
```

## Preview enablement

Enable exactly:

```text
bestCandidateLock.enabled = true
bestCandidateLock.epsilon = 0
falseFinalMinorGuard.enabled = true
minorPreservePrompt.enabled = true
regressionAutoAckBrake.enabled = true
```

Validate four controlled trajectories: craft-only Final MINOR suppression, blocking Final MINOR
remediation, 85→63 lock+brake, and legacy full-draft MINOR response without metadata.

## Production validation protocol

1. Deploy all behavior flags OFF and confirm `aiTfesVersion=v1.6`.
2. Complete Preview trajectories and inspect artifacts/transitions.
3. Enable all four flags for a bounded canary cohort; keep epsilon `0`.
4. Compare a manifest-matched control and RC cohort by `--ai-tfes-version`.
5. Verify no rise in exhaustion/manual recovery and inspect every suppressed Final MINOR.
6. Expand only after editors confirm retained drafts and suppressed cases are usable.

## Known risks

- Craft/blocking classification is deterministic keyword allow/deny logic; unknown text fails
  safe but may reduce suppression recall.
- Epsilon `0` may react to scoring noise.
- Preserve metadata is model-authored and optional; it is not patch verification.
- Braking increases Human Review pauses.
- Best retention prevents quality loss but does not make full-draft generation converge.
- Config is deployment-wide; there is no per-user cohort router in RC1.

## Rollback

Each behavior rolls back independently by setting its flag OFF. For emergency rollback, turn
all four behavior flags OFF; telemetry/reporting remains enabled and no stored transition or
artifact needs migration or deletion.
