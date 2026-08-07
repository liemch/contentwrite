# WP-PV2-01 — Prompt Trio Migration

**Status:** Implemented technically; feature OFF; Preview/cohort validation pending  
**Date:** 2026-08-07

## Scope

Implements only:

- `editorial-diagnosis@2.0`
- `minor-remediation@2.0`
- `lock-verifier@2.0`

All other runtime prompts remain v1.6. This WP does not include Section Patch Engine,
multi-agent routing, state-machine redesign, schema changes, or migrations.

## Runtime registry

`web/src/lib/tfes/prompt-registry.ts` resolves:

- `promptId`
- `promptVersion`
- `contractVersion`
- `role`
- `source`

Disabled or unknown versions fail safe to v1.6. The runtime prompt implementations live in
`web/src/lib/tfes/prompts-v2.ts`; production does not import the proposal directory.

## Configuration

```text
PIPELINE_CONFIG.aiTfesV2.promptArchitecture.enabled = false
editorialDiagnosisVersion = "2.0"
minorRemediationVersion = "2.0"
lockVerifierVersion = "2.0"
```

- OFF: all three call sites use existing v1.6 prompts/contracts.
- ON: only the three selected prompts use v2.
- Rollback: set `promptArchitecture.enabled = false`; no data rollback.

## Editorial Diagnosis v2

- DIAGNOSE-only prompt.
- Context: Thesis/Outline Lock, Article Shape, complete frozen candidate.
- Excludes Research dump, Fact/Final history, and remediation instructions.
- Strict marked JSON: scores, exact G1–G8, decision, typed defects, required actions.
- Parser accepts unknown additive fields and preserves v1.6 canonical/legacy contracts.
- Malformed v2 output cannot PASS and routes through existing safe review behavior.

## MINOR Remediation v2

- Used only for `MINOR_REVISION_REQUIRED`.
- MAJOR/REWRITE remain v1.6.
- Required order: defects/actions, preserve mask, targets, local neighbors, minimal Fact evidence,
  compatibility base candidate.
- Keeps full-draft output temporarily; telemetry labels
  `remediationMedium=full-draft-preserve`.
- Best-effort `CHANGED_SECTIONS` / `UNCHANGED_SECTIONS` remains non-blocking.
- No Section Patch apply engine.

The full candidate remains necessary because current runtime replaces `draft12` atomically. The v2
context removes full Research, Insight, prior Review history, and full Fact Ledger from this call.

## Lock Verifier v2

- LOCK-only prompt.
- Context: typed Editorial result, Fact summary/blockers, Thesis Lock, regression summary, and a
  clipped candidate signal for the insight floor.
- No full craft re-score and no generated repair.
- Strict marked JSON: lock decision, Fact lock, insight floor, blocking residuals, required
  actions, unresolved defect IDs, regression, optional polish.
- Craft-only polish stays optional while `lockDecision=LOCKED`.
- Blocking outcomes map to existing safe states; no state-machine changes.

## Telemetry

Every trio event can include `details.telemetry.prompt`:

- prompt ID/version/contract/role/source;
- prompt architecture version;
- actual context characters;
- equivalent v1.6 context characters;
- context reduction characters/ratio;
- estimated input tokens (`ceil(chars/4)`);
- defect count;
- `full-draft-preserve` remediation medium;
- Lock decision/blocking count/false-MINOR equivalent/malformed flag.

When the switch is ON, common telemetry uses `aiTfesVersion=v2-rc2`; RC1-only exposure remains
`v2-rc1`, and all behavior switches OFF remains `v1.6`.

Telemetry never contains full prompt or article content.

The report adds:

- `promptArchitectureVersionEvents`;
- `promptContextById` averages for context characters, v1.6 comparison, token estimate,
  reduction ratio, and malformed rate.

Static default-target context caps indicate:

- MINOR compatibility context: roughly 33k v1.6 characters versus roughly 24k v2 characters
  (about 25–30% lower; actual data varies with defects/sections).
- Lock context: roughly 23k v1.6 characters versus at most roughly 13k v2 characters
  (about 40–45% lower).

The proposal's 55–75% MINOR reduction remains a Section Patch target; it is not claimed for this
full-draft compatibility release. Runtime telemetry is the source of truth.

## Tests

Automated tests do not call live AI or a production database:

- registry v1.6 fallback, v2 selection, unknown-version fallback;
- strict marked JSON parser;
- Editorial diagnose-only contract and malformed fail-safe;
- MINOR preservation/context/legacy full-draft compatibility;
- Lock craft-only PASS, blocking fail, malformed fail-safe;
- 85 Editorial PASS → Fact PASS → Lock v2 with optional craft polish → lock without rewrite;
- real MINOR → preserve prompt → 85→63 Candidate Lock rejection;
- telemetry and metrics aggregation.

## Production validation

1. Deploy with `promptArchitecture.enabled=false`.
2. Confirm telemetry remains v1.6 and existing RC1 trajectories pass.
3. Use an isolated Preview database before any AI-triggered test.
4. Enable Prompt Architecture v2 with Best Candidate Lock enabled.
5. Run controlled trajectories:
   - Editorial machine readability;
   - 85 PASS + Fact PASS + craft-only Lock note;
   - blocking Lock residual;
   - real MINOR preserve;
   - regressing remediation candidate.
6. Compare context, malformed, convergence, exhaustion, and human recovery metrics.
7. Keep rollout bounded until editors review every Lock bypass and regression.

## Rollback

Set `PIPELINE_CONFIG.aiTfesV2.promptArchitecture.enabled=false`. Existing v1.6 builders and parsers
remain present. Additive v2 telemetry/artifacts remain readable; no schema, migration, environment,
or data cleanup is required.

## Known risks

- Full-draft MINOR output is still soft preservation, not hash-enforced patching.
- V2 typed defects rely on model schema compliance and need production calibration.
- Lock context uses a clipped candidate signal for insight floor; missed global issues must be
  measured.
- Configuration is deployment-wide, not a per-article cohort router.
- Approximate tokens use characters/4, not provider tokenization.

