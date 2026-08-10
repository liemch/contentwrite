# WP-QF-06 — Threshold revisit

**Status:** Decision memo — **thresholds unchanged** (no config cut)  
**Depends on:** WP-QF-01..05, Preview/Canary KPIs  
**Design:** [quality-first-pipeline.md](../designs/quality-first-pipeline.md)

## Goal

Revisit Editorial/Final score floors only after measuring false reject vs weak articles that still pass.

## Decision (2026-08-10)

**Keep Editorial ≥85 and Final ≥90** (and insight floors 20 / 22) until a Preview cohort on
`optimize/process` shows:

1. False reject rate (human says “đáng đọc” but machine MINOR/MAJOR) with denominators
2. Weak-pass rate (machine PASS but human “không đăng được”)
3. Meta-leak = 0 and candidate retention healthy under QF-01..05

Rationale: Phase C already raises context, severity-aware remediation, publish-from-best, and
craft-only Final suppression. Blind lowering floors would mask remaining craft defects and
reintroduce passability gaming.

## Non-goals until data

- Blind lowering of 85/90 floors
- Raising revision retry 3→5

## Acceptance

- [x] Written decision memo with explicit “no change pending cohort”
- [ ] Config change with rollback note — **deferred** until cohort evidence
