# WP-QF-05 — Prompt language split

**Status:** Done on `optimize/process`  
**Depends on:** WP-QF-00  
**Design:** [quality-first-pipeline.md](../designs/quality-first-pipeline.md)

## Goal

Machine prompts may use internal insight depth tiers (L0–L3); reader-facing write/publish/polish prompts never instruct the model to put L2/Gate jargon in body. Complements the publish scrubber.

## Implemented

- Insight Gate / Decision keep L0–L3 machine language
- Write / FORMAT_RULES / Publish / Polish ban Insight Gate, “Insight L2”, ≥ L2, GOLD_BAR, PROVISIONAL_*, EDITORIAL_DECISION in reader body
- Write steps say “Insight Gate đạt” instead of “Insight ≥ L2” as a body instruction
- `stripReaderFacingMeta` still neutralizes leaks at publish

## Acceptance

- [x] Write/publish prompts use reader language for craft guidance
- [x] Insight Gate tab still uses L0–L3 for machine gate
- [x] Meta-leak fixtures remain green
