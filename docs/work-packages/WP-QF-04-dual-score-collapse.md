# WP-QF-04 — Dual-score craft collapse

**Status:** Done on `optimize/process`  
**Depends on:** WP-QF-00, falseFinalMinorGuard  
**Design:** [quality-first-pipeline.md](../designs/quality-first-pipeline.md)

## Goal

Final verify must not reopen craft-only MINOR loops when lock-v2 already cleared evidence/actions.

## Implemented

- `evaluateFinalMinorGuard` accepts `machineContract` + `lockResiduals`
- lock-v2 with empty residual list → craft-only (eligible for suppression)
- Workflow passes `result.blockingResiduals` when `machineContract === "lock-v2"`

## Acceptance

- [x] Empty lock-v2 residuals are craft-only, not unknown-residual
- [x] Blocking lock residuals still fail-safe (no suppress)
- [x] Score floors unchanged
