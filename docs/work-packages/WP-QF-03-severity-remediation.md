# WP-QF-03 — Severity-aware remediation

**Status:** Done on `optimize/process`  
**Depends on:** WP-QF-00, minorPreservePrompt  
**Design:** [quality-first-pipeline.md](../designs/quality-first-pipeline.md)

## Goal

MINOR keeps preserve semantics; MAJOR/REWRITE may restructure without inheriting “freeze the draft”.

## Implemented

- `minor-remediation@2.0` / preserve prompt only for `MINOR_REVISION_REQUIRED`
- Legacy `finalize-revision-remediate` prompt documents MINOR / MAJOR / REWRITE depth
- Workflow prepends `## MAJOR MODE` / `## REWRITE MODE` directives for non-MINOR states
- No L2 jargon instructed into reader body during remediation

## Acceptance

- [x] MINOR still preserve-constrained
- [x] MAJOR/REWRITE receive explicit rewrite latitude
- [x] No raise of revision retry 3→5
