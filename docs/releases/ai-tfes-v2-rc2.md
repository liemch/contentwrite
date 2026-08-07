# AI-TFES v2 RC2 — Prompt Trio

**Release candidate:** RC1 controls plus WP-PV2-01 Prompt Architecture trio  
**Default behavior:** v1.6-compatible; prompt architecture switch defaults OFF

## Features

- Minimal runtime Prompt Registry with v1.6 fallback.
- `editorial-diagnosis@2.0`: DIAGNOSE-only typed JSON.
- `minor-remediation@2.0`: MINIMUM EDIT with full-draft compatibility and preserve metadata.
- `lock-verifier@2.0`: evidence/action/insight/regression Lock without global craft re-score.
- Prompt/version/context/token-estimate telemetry and bounded metrics.

No other prompt migration, Section Patch Engine, multi-agent routing, state-machine rewrite,
schema change, migration, model change, threshold change, or retry change is included.

## Configuration

```text
PIPELINE_CONFIG.aiTfesV2.promptArchitecture.enabled = false
PIPELINE_CONFIG.aiTfesV2.promptArchitecture.editorialDiagnosisVersion = "2.0"
PIPELINE_CONFIG.aiTfesV2.promptArchitecture.minorRemediationVersion = "2.0"
PIPELINE_CONFIG.aiTfesV2.promptArchitecture.lockVerifierVersion = "2.0"
```

OFF selects all existing v1.6 prompts. ON selects only this trio; the remaining prompts stay
v1.6. Unknown requested versions fail safe to v1.6. New events are labeled
`aiTfesVersion=v2-rc2` plus `promptArchitectureVersion=2.0`.

## Telemetry and metrics

`details.telemetry.prompt` records registry metadata, prompt architecture version, context
characters, equivalent v1.6 context, approximate input tokens, and phase outcomes. It never
records prompt/article content.

The bounded report exposes:

- `promptArchitectureVersionEvents`;
- `promptContextById`;
- average current/v1.6 context characters;
- average context reduction and token estimate;
- malformed rate by prompt.

## Preview validation

Use an isolated Preview database. Do not trigger AI if Preview points to production data.

Recommended RC2 Preview flags:

```text
bestCandidateLock.enabled = true
bestCandidateLock.epsilon = 0
falseFinalMinorGuard.enabled = true
regressionAutoAckBrake.enabled = true
promptArchitecture.enabled = true
```

`minorPreservePrompt` may remain OFF because `minor-remediation@2.0` contains the stronger
preserve contract. Validate:

1. Editorial v2 produces valid typed defects/actions.
2. 85 Editorial PASS + Fact PASS + optional craft polish locks without revision.
3. Blocking Lock residual does not publish.
4. Real MINOR keeps title/thesis/outline/unrelated sections.
5. A 85→63 candidate is rejected when Candidate Lock is enabled.
6. v1.6 fallback works after switching prompt architecture OFF.

## Rollback

Set `promptArchitecture.enabled=false`. Existing v1.6 prompt builders/parsers remain active and
all v2 fields are additive. No data rollback, migration, or artifact deletion is needed.

Production Validation kit: [AI-TFES-v2-RC2-validation.md](./AI-TFES-v2-RC2-validation.md).

## Known risks

- MINOR still returns a full draft; preservation is prompt-enforced, not patch/hash-enforced.
- Typed JSON compliance and Lock recall need real cohort measurement.
- Approximate input tokens are not provider tokenizer results.
- Config is deployment-wide.
- V2 Lock intentionally narrows craft review; inspect all early Lock outcomes for escaped issues.

