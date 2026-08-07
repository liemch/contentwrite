# WP-V2-04 — MINOR Preserve Prompt

**Status:** Implemented technically; flag OFF pending Preview validation
**Behavior flag:** `PIPELINE_CONFIG.aiTfesV2.minorPreservePrompt.enabled`
**Prompt version:** `v2-rc1-minor-preserve-v1`

## Contract

Only `MINOR_REVISION_REQUIRED` receives the additive preserve block:

- preserve title unless explicitly named;
- preserve outline and section order unless explicitly named;
- preserve thesis/main insight and unrelated sections;
- no global restyle or unnecessary new claims;
- modify the minimum failing surface.

MAJOR and REWRITE prompts remain unchanged. The output is still the complete Article.md; this
WP does not implement patch application.

The model is asked to append `UNCHANGED_SECTIONS` and `CHANGED_SECTIONS`. Runtime strips these
two lines before quality checks/artifact persistence and parses them only for telemetry.
Missing metadata does not fail the workflow, so legacy full-draft responses remain valid.

## Telemetry

Enabled MINOR remediation records prompt version, changed/unchanged section counts when
readable, and `preserveMetadataReadable`.

## Rollback and tests

Flag OFF removes the additive prompt block. Tests verify MINOR constraints, no leakage into
MAJOR/REWRITE, independent disable, metadata parsing/removal, and legacy response compatibility.
