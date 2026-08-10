# WP-QF-02 — Context budget reader/fact

**Status:** Done on `optimize/process`  
**Depends on:** WP-QF-00  
**Design:** [quality-first-pipeline.md](../designs/quality-first-pipeline.md)

## Goal

Raise review / fact / reader-sim draft clips so tail sections (References, Takeaways, Discussion) are visible before any threshold loosening.

## Implemented

- `factDraftClipChars` aliases `reviewDraftClipChars` (16k–32k scaled by target)
- `readerSimClipChars` uses `readerSimDraftMinChars: 12_000` / max 24_000
- Fact Check + Fact remediate + Reader Simulation in `workflow.ts` use these helpers

## Acceptance

- [x] Reviewer context includes Key Takeaways/References on typical 1200-word drafts
- [x] Reader sim clip > old 5.5k hardcode
- [x] No schema/migration
