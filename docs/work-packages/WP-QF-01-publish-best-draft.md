# WP-QF-01 — Publish bám best draft

**Status:** Done on `optimize/process`  
**Depends on:** WP-QF-00, Best Candidate Lock ON  
**Design:** [quality-first-pipeline.md](../designs/quality-first-pipeline.md)

## Goal

Clean publish derives from the best locked draft revision instead of regenerating a full `finalize-b` pass that dilutes voice/insight.

## Implemented

- When `bestCandidateLock` is ON and a best draft exists, Publish Ready derives
  `cleanPublish` via `toReaderCleanPublish(sanitizeEditorialBody(bestBody))`
- Falls back to `finalize-b` only when lock is off or no restorable best artifact
- Meta scrubber still runs through `toReaderCleanPublish`

## Out of scope

Patch Editing, schema, lowering score floors.

## Acceptance

- [x] Published body tracks best candidate revision when lock holds a best
- [x] Meta scrubber (Insight L2 / Gate) still runs on clean output
- [ ] Cohort: voice regression vs regenerate baseline measured (Preview)
