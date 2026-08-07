# AI-TFES v2 Implementation Roadmap

**Date:** 2026-08-07
**Status:** Roadmap only — no implementation authorized in this document
**Sources:**

- `docs/architecture/ai-tfes-architecture-review.md`
- `docs/architecture/ai-tfes-v2-proposal.md`
- Production trajectory: Editorial 85 PASS → Fact PASS → Final 85 MINOR → Editorial 63 → 56 → exhausted
- WP2.5–WP2.7.1 observability already shipping

**Legend**

| Label | Meaning |
|---|---|
| **Evidence** | Supported by production telemetry and/or current runtime/prompt contracts |
| **Hypothesis** | Plausible; not yet proven by cohort statistics |
| **A/B required** | Must compare against current path with production/staging cohort |
| **Implement-now** | Low-risk change that can ship behind flag or prompt-only with clear rollback |
| **Experimental** | Cannot prove success with current telemetry alone; needs new instrumentation + cohort |

Companion executable catalog: `docs/work-packages/AI-TFES-v2-roadmap.md`.

---

## 1. Proposal triage

### 1.1 Proven by production telemetry / runtime (Evidence)

| Finding | Evidence |
|---|---|
| Remediation emits full draft rewrite | Prompt: “Chỉ xuất toàn bộ bản nháp Markdown revision mới”; runtime replaces `draft12` |
| Score diverges after Final→Revision | Timeline: 85 → 63 → 56 → exhausted |
| Editorial bar 85 vs Final bar 90/grace 87 creates ping-pong | `contract.ts` + Final 85 MINOR after Editorial 85 PASS + Fact PASS |
| Shared revision budget burns across failure classes | `MAX_REVISION_REMEDIATION_RETRIES=3` covers editorial/gold-bar/final fails |
| No anti-regression controller | Runtime never compares new score to previous best |
| Post-revision auto-ack continues loops without human brake | `POST_REVISION_REVIEW_MARK` auto-ack path in workflow |
| Fact loop re-validates correctly | WP2.7.1: Fact Check between remediations is real |
| Orchestration/parser/telemetry are not the bottleneck | WP2.5–WP2.7.1 gates green; trajectory still diverges |

### 1.2 Hypothesis (do not treat as fact)

| Proposal | Why Hypothesis |
|---|---|
| Instruction dilution is primary cause of divergence | Failure-block packing already fixed (WP2.5); dilution not isolated in cohort |
| Exact Editorial↔Final overlap is 60–80% | Shared G1–G8 is Evidence; percentage is estimate |
| Section patch will raise convergence for all severities | Proven need is “stop rewrite on MINOR”; patch efficacy needs A/B |
| Typed multi-agent swarm improves quality | No production proof; adds orchestration risk |
| Partial Fact invalidation by claim id improves convergence | Logical; needs claim-stable ids + telemetry first |
| ε threshold for anti-regression (0 vs 2–3) | Must be tuned experimentally |

### 1.3 Needs A/B test before declaring success

| Change | Why A/B |
|---|---|
| MINOR section-patch vs full rewrite | Directly changes article quality distribution |
| Align Editorial bar to 87 vs expand Final near-miss after Editorial≥85+Fact PASS | Two different contract fixes; measure false MINOR rate + publish quality |
| Best-candidate lock reject policy | May increase human recovery rate while improving retained quality |
| Final delta verification | May miss cross-section regressions |
| Disable auto-ack on score drop | May stall workflows; measure completion vs quality |

### 1.4 Can implement now (Implement-now)

Safe if behind feature flag / prompt-only / additive telemetry, with rollback:

1. **Convergence KPI instrumentation** (score deltas, regression flags, Final-after-Editorial-85+Fact events)
2. **Prompt harden MINOR**: forbid outline/title rewrite unless listed; require preserve list in narrative
3. **Telemetry flag** `scoreRegressionLoop` when editorial scores decrease ≥2 consecutive remediations
4. **Contract clarification docs** for operators (no behavior change)

Do **not** implement full Candidate Lock Architecture, multi-agent split, or schema redesign “now” without WPs below.

---

## 2. Evaluation of the three large bets

### A. Patch Editing

| Question | Answer |
|---|---|
| Should we do it? | **Yes** — after convergence telemetry (WP-V2-01) and preferably after bar/anti-regression quick wins |
| ROI | **Highest** among structural changes — attacks proven rewrite destruction |
| Risk | Medium — parse/patch apply bugs can corrupt draft; mitigate with flag + fallback to current rewrite |
| Order | After WP-V2-01; before or paired with Best Candidate Lock |
| Dependencies | Needs section boundaries detectable in Article.md; needs apply/verify tests |
| Evidence vs Hypothesis | Need for change = **Evidence**. Patch beats rewrite = **A/B required** / **Hypothesis** until cohort |

### B. Best Candidate Lock

| Question | Answer |
|---|---|
| Should we do it? | **Yes** — earliest high-ROI controller change after instrumentation |
| ROI | **Very high** — would have retained the 85 draft instead of accepting 63/56 |
| Risk | Low–medium — deterministic controller; risk is rejecting useful improvements near noise |
| Order | Right after KPI telemetry; can ship before full patch protocol |
| Dependencies | Needs persisted previous editorial score in transition telemetry (mostly already present) |
| Evidence vs Hypothesis | Regression without lock = **Evidence**. Optimal ε = **A/B required** |

### C. Final Delta Verification

| Question | Answer |
|---|---|
| Should we do it? | **Yes, but later** — after bar alignment and/or candidate lock reduce false MINOR loops |
| ROI | High for cost/stability; medium until patch exists (delta needs a delta) |
| Risk | Medium–high — may miss global regressions if patcher drifts |
| Order | After Patch Editing MVP or at least after “Final craft-MINOR suppression when Editorial≥85+Fact PASS” |
| Dependencies | Patch metadata or Required Revisions machine list; Fact lock remains full until claim-stable ids |
| Evidence vs Hypothesis | Double-judge pain = **Evidence**. Delta-only Final is safe = **A/B required** |

### Recommended sequence for A/B/C

```text
KPI telemetry
  → Best Candidate Lock (B) [controller]
  → Bar / false-MINOR quick contract (supports C)
  → Patch Editing MVP for MINOR (A)
  → Final Delta Verification (C)
```

Rationale: B stops bleeding immediately without changing generation medium; A changes the medium; C specializes the second judge once deltas exist.

---

## 3. Priority scoring method

Each WP scored 1–5:

`Priority = Impact × ProductionValue / (Risk × Complexity)`

Higher is better. Experimental WPs cannot outrank Evidence-backed quick wins until they earn telemetry.

---

## 4. Work Package map (summary)

| Order | WP | Class | Priority band |
|---|---|---|---|
| 1 | WP-V2-01 Convergence KPI Telemetry | **Implemented — cohort pending** | Highest |
| 2 | WP-V2-02 Best Candidate Lock | **Implemented — flag off, cohort pending** | Highest |
| 3 | WP-V2-03 False Final MINOR Guard | **RC1 implemented — flag off** | Highest |
| 4 | WP-V2-04 MINOR Preserve Prompt | **RC1 implemented — flag off** | High |
| 5 | WP-V2-05 Regression Auto-ack Brake | **RC1 implemented — flag off** | High |
| 6 | WP-V2-06 Split Revision Budgets | Evidence | Medium-High |
| 7 | WP-V2-07 Section Patch MVP | A/B / Experimental until proven | Medium-High |
| 8 | WP-V2-08 Final Delta Lock Mode | A/B | Medium |
| 9 | WP-V2-09 Typed Defect Schema | Hypothesis / Experimental | Medium |
| 10 | WP-V2-10 Partial Fact Invalidation | Hypothesis / Experimental | Lower |
| 11 | WP-V2-11 Constrained Rewrite Agent | Experimental | Lower |
| 12 | WP-V2-12 Multi-specialist Router | Experimental | Lowest near-term |

Detailed specs: `docs/work-packages/AI-TFES-v2-roadmap.md`.

---

## 5. Mandatory success KPIs

All rates require explicit denominators (WP2.7 style).

| KPI | Numerator | Denominator | Notes |
|---|---|---|---|
| Editorial score monotonicity rate | Cycles where score_t ≥ score_{t-1} − ε | Remediation cycles with ≥2 editorial scores | Primary convergence signal |
| Candidate regression rate | Cycles accepting draft with score drop > ε | Remediation accepts | Should fall after Best Candidate Lock |
| Final false-MINOR rate | Final MINOR after Editorial≥85 + gate0 + Fact PASS | Articles reaching Final with that precondition | Directly measures bar ping-pong |
| First-pass rate | Complete with 0 revision/fact remediation | Cohort articles | Existing WP2.7 metric |
| Revision convergence rate | Reach Final PASS without exhaustion after ≥1 remediation | Articles with ≥1 revision remediation | |
| Average remediation attempts | Revision + fact remediations | Cohort articles | Existing |
| Patch success rate | Patches accepted without regression + defect closed | Patch attempts | Only after WP-V2-07 |
| Exhaustion rate | Exhausted articles | Cohort articles | Existing |
| Human recovery rate | Manual draft recovery used | Exhausted articles | Existing recovery path |
| Lock pass rate | Final/Lock PASS | Final/Lock attempts | |

**Go criterion for any Experimental WP:** improves monotonicity and/or false-MINOR rate without raising exhaustion or human recovery beyond agreed bounds on a ≥N-article cohort (N from WP2.7 protocol, minimum 5+3).

---

## 6. What v2 is not (near term)

Do **not** start with:

- Full multi-agent rewrite of Research/Write
- Prisma state-machine rename to Candidate Lock enums
- AST document IR
- Benchmark WP-E0A as a substitute for convergence fixes

Those remain future options after Evidence-backed WPs move the production curve.

---

## 7. Two-week investment answer

If only **two engineering weeks** are available to maximize convergence:

1. **WP-V2-01** Convergence KPI Telemetry (≤2 days)
2. **WP-V2-02** Best Candidate Lock (≈3–4 days)
3. **WP-V2-03** False Final MINOR Guard (≈2–3 days)
4. **WP-V2-04** MINOR Preserve Prompt (≈1 day)
5. **WP-V2-05** Regression Auto-ack Brake (≈1–2 days)
6. Remaining time: staging/production cohort measurement + rollback review — **not** Patch MVP unless 01–05 are green

**Do not** spend the two weeks on Final Delta, typed multi-agent, or partial Fact IR first.

This sequence attacks the proven chain:

`Final 85 MINOR → full rewrite accepted even when worse → auto-continue → exhaust`

…with deployable, rollbackable controllers before changing the generation medium.
