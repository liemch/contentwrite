# AI-TFES Architecture Review

**Role:** Principal AI Architect
**Date:** 2026-08-07
**Scope:** AI workflow, prompt architecture, remediation, review loops, fact/final gates
**Out of scope:** React, Next.js, TypeScript style, Prisma, UI, DevOps, Docker, Vercel

**Evidence basis**

| Evidence class | Source |
|---|---|
| Production trajectory | Timeline: Revision #1 → Editorial 85 / gate 0 PASS → Fact PASS → Final 85 → MINOR → Revision #2 → Editorial 63 MAJOR → Revision #3 → Editorial 56 REWRITE → exhausted |
| Runtime contracts | `web/src/lib/tfes/contract.ts`, `finalize-phase.ts`, `retry-policy.ts`, `remediation-budget.ts` |
| Prompt contracts | `web/src/lib/tfes/prompts.ts` (`finalize-review`, `finalize-a`, `finalize-revision-remediate`, `finalize-fact-remediate`, `finalize-verify`) |
| Context assembly | `workflow.ts`, `review-context.ts`, `pipeline-config.ts` |
| Observability | WP2.7 / WP2.7.1 remediation + Fact Check telemetry |

Legend:

- **Fact** — supported by production telemetry and/or current runtime/prompt code.
- **Hypothesis** — plausible but not yet proven by cohort statistics.

---

## 1. Current architecture: strengths and weaknesses

### Strengths (Fact)

1. **Staged quality gates exist.** Research → Draft → Editorial Review → Fact Check → Final Verification → Publish is a real multi-gate pipeline, not a single “write once” generation.
2. **Provisional vs locked evidence is intentional.** Step 8 uses `PROVISIONAL_*`; step 9b uses `FINAL_*` and Fact Ledger. Machine keys are separated (WP2.6).
3. **Fact Check is a first-class ledger phase**, not a soft instruction inside review.
4. **Remediation loops are real and instrumented.** WP2.7/2.7.1 prove retry, recovery-cycle budget, Fact Check re-validation between remediations, and exhaustion are software-correct.
5. **Feedback placement for 9b Required Revisions was fixed (WP2.5).** Latest failure reason is now assembled at the head of remediation context via `buildRevisionFeedbackBlock`.

### Weaknesses (Fact, unless marked Hypothesis)

1. **Remediation is full-draft regeneration**, not surgical patch. Prompt contract: “Chỉ xuất toàn bộ bản nháp Markdown revision mới”.
2. **Editorial bar (85) and Final bar (90 / grace 87) are asymmetric.** An article can pass Editorial at 85, pass Fact, then fail Final at 85 → MINOR. Production trajectory shows exactly this.
3. **One shared revision budget covers Editorial fail, gold-bar precheck, and Final fail.** Three attempts are burned by different failure classes.
4. **Post-revision re-review auto-acks human gate.** After remediation, the system can keep looping without a human stopping a regressing draft.
5. **No score-monotonicity or regression guard.** Nothing in runtime forbids 85 → 63 → 56.
6. **Editorial and Final reuse the same G1–G8 checklist** with different evidence semantics — high structural overlap.
7. **Fact remediation skips re-Editorial Review** (returns `EDITORIAL_REVIEWED`), while revision remediation forces full re-Editorial Review — inconsistent change-control philosophy.
8. **Hypothesis:** Instruction dilution still occurs because remediation CONTEXT stacks research + insight + prior review + draft + optional fact + failure block into one generation call.

---

## 2. Answers to the eleven analysis questions

### 1) Is the workflow compatible with Iterative Refinement?

**Mostly no (Fact + Hypothesis).**

Iterative refinement requires:

- preserve what already works;
- change the minimum failing surface;
- verify the delta;
- refuse regressions.

Current loop:

```text
Final fail (score 85, MINOR)
  → full-draft rewrite (remediate-required-revision)
  → DRAFTED
  → full Editorial re-score
  → auto-ack if pass/fail continues
```

Production shows **anti-refinement**: 85 → 63 → 56. That is score divergence under rewrite pressure, not convergence.

Software retries are correct. The **learning/update rule** is wrong for refinement.

### 2) Remediation: Rewrite or Patch?

**Rewrite (Fact).**

Even MINOR says “sửa chính xác wording…”, but the **output contract is always a full Article.md**. There is no diff, section lock, or preserve-mask. Runtime replaces `draft12` wholesale.

So severity labels describe intent; the medium forces rewrite.

### 3) Which prompts can destroy the article?

Ranked by destruction potential given production trajectory:

| Prompt | Risk | Evidence |
|---|---|---|
| `finalize-revision-remediate` | **Highest** | Full rewrite; REWRITE tier explicitly abandons old wording; production score collapse after 9b→revision |
| `finalize-verify` | High | Can send a Fact-passed 85 article back into revision with only a 5-point bar gap vs Editorial |
| `finalize-review` (post-revision) | High | Re-scores entire draft after rewrite; produced 63 then 56 |
| `finalize-fact-remediate` | Medium | Also full-draft rewrite, but scoped to ledger; fact loop re-validates |
| `finalize-a` (Fact Check) | Lower for structure | Can force claim edits but does not itself rewrite unless remediation follows |
| Research / Knowledge | Indirect | Bad evidence upstream propagates; not the proximate cause of 85→56 |

### 4) Context: too little, too much, or wrong order?

**Wrong shape more than raw size (Fact + Hypothesis).**

Facts:

- Failure reason / 9b Required Revisions are now placed first (good).
- Draft clip for review/remediation is large (16k–32k by target).
- Fact Check draft clip is smaller (6k) than remediation draft clip.

Hypothesis:

- Stacking research + insight + prior review + full draft after “required fixes” still dilutes the surgical instruction when the model must regenerate the whole article.
- Instruction Dilution is therefore **Hypothesis** as a primary mechanism; the **proven** mechanism is full-rewrite update rule + asymmetric bars.

### 5) Is reviewer feedback prioritized?

**Partially yes in packing; no in update semantics (Fact).**

- Packing: failure block is first (`buildRevisionFeedbackBlock`) — Fact.
- Semantics: model must emit a whole new draft — Fact.
- Therefore feedback can be “seen” and still overwritten by global regeneration — Hypothesis for attention failure; Fact for lack of preserve constraints.

### 6) Editorial vs Final overlap?

**High structural overlap (~60–80% of checklist surface) (Hypothesis on exact %, Fact on shared G1–G8).**

Shared:

- G1–G8
- Insight depth
- Evidence / craft / practical value narrative rubric (`Review.md`)

Distinct (Fact):

- Evidence PROVISIONAL vs LOCKED
- Fact PASSED required only at 9b
- Total bar 85 vs 90 (grace 87)
- Machine keys differ

Production proof of costly overlap: Editorial PASS 85 / gate 0 → Fact PASS → Final 85 MINOR. Same article, same gates, second judge with higher bar.

### 7) Should Fact Check run after Revision or before?

**After a frozen draft candidate, before Final lock — current order is correct (Fact).**
**Re-running Fact after every full rewrite is mandatory (Fact).**
**Hypothesis:** Fact should not be the first gate for rhetorical/structure issues; those belong to Editorial. Current design already does this.

Danger in current design (Fact): revision remediation clears `factCheck`, then after re-Editorial pass Fact runs again. Full rewrites can reintroduce unsupported claims even when the previous Fact passed.

### 8) Should Final Verification review whole article or only changed parts?

**Today: whole article (Fact).**
**For convergence: Final should become a delta/lock gate over a frozen candidate (Proposal — see v2 doc).**

Given production, whole-article Final after Editorial already passed is creating a second global judge that kicks a rewrite loop. That is expensive and unstable.

### 9) What remediation model should be used?

Recommended ladder (architecture recommendation, not implemented):

1. **Section / claim patch** for MINOR
2. **Constrained multi-section edit** for MAJOR
3. **Structured rewrite with preserve-mask** only for REWRITE
4. Avoid free-form full rewrite as the default medium

Diff/AST editing are useful *representations* if the article representation is structured; today the artifact is free Markdown, so **section editing + preserve lists** is the practical next step.

### 10) Is Prompt Drift occurring?

**Yes after Final→Revision loops (Fact for score drift; Hypothesis for semantic drift).**

Observed trajectory:

| Step | Score / decision |
|---|---|
| Editorial after Rev #1 | 85 PASS |
| Final | 85 MINOR |
| Editorial after Rev #2 | 63 MAJOR |
| Editorial after Rev #3 | 56 REWRITE |

This is **quality drift under remediation**, not parser failure (WP2.5–2.7.1 already verified).

Likely drift locus (Hypothesis): `finalize-revision-remediate` regenerates global voice/structure; subsequent Editorial judges the new artifact harsher and escalates severity (`MAJOR` → `REWRITE`), which increases rewrite pressure again — a positive feedback loop.

### 11) If redesigning AI-TFES from scratch?

See companion: `docs/architecture/ai-tfes-v2-proposal.md`.

Short answer: **Candidate Lock Architecture** — generate once to a candidate, diagnose failures as typed defects, patch minimally, re-verify only affected contracts, refuse regressions, escalate rewrite only with preserve-mask.

---

## 3. Root cause of 85 → 63 → 56

### Causal chain (Fact unless marked)

1. **Bar mismatch (Fact).** Editorial accepts 85; Final requires 90 (or grace 87). Production: Editorial 85 PASS → Final 85 MINOR.
2. **MINOR still triggers full-draft remediation (Fact).** Output contract is whole Article.md.
3. **Rewrite invalidates the previously good candidate (Fact).** `draft12` replaced; Fact cleared; clean cleared.
4. **Re-Editorial scores the new draft globally (Fact).** Production: 63 MAJOR, then 56 REWRITE.
5. **Severity escalation increases rewrite pressure (Fact).** MAJOR/REWRITE instructions authorize deeper regeneration.
6. **Shared attempt budget exhausts without convergence (Fact).** Three remediations → exhausted.
7. **No anti-regression controller (Fact).** Runtime never compares new score to previous best.
8. **Hypothesis:** the model treats remediation as “write a better article from scratch under criticism,” which maximizes variance, not local repair.

### One-sentence root cause

**The pipeline uses rewrite-as-remediation under an asymmetric double-judge, so each “fix” samples a new article instead of converging on the last good candidate.**

---

## 4. Top 10 problems by ROI

| # | Problem | Class | Why high ROI | Evidence |
|---|---|---|---|---|
| 1 | Full-draft rewrite remediation | Architecture | Stops destroying passing content | Prompt output contract; 85→63→56 |
| 2 | Editorial 85 vs Final 90 asymmetry | Contract | Removes false MINOR loops | contract.ts; production Final 85 after Editorial 85 |
| 3 | No regression / best-candidate lock | Control | Converts retries into search with memory | Telemetry score decline |
| 4 | Shared revision budget across failure classes | Budgeting | Stops gold-bar/8/9b from burning same 3 | retry-policy + workflow routing |
| 5 | Final re-judges whole article after Editorial+Fact pass | Gate design | Final should lock deltas, not restart | Production path Fact PASS → Final MINOR |
| 6 | Post-revision auto-ack while regressing | Human-in-loop | Prevents silent death spirals | workflow auto-ack; declining scores |
| 7 | Severity escalation without preserve-mask | Prompt | MAJOR/REWRITE authorize broader damage | prompts.ts severity tiers |
| 8 | Fact cleared + full rewrite can reintroduce claim risk | Sequencing | Wastes Fact PASS | factCheck:null on revision remediate |
| 9 | High checklist overlap Editorial↔Final | Rubric | Double cost, unstable judgments | shared G1–G8 |
| 10 | No typed defect model (structure vs claim vs evidence lock) | Representation | Without types, every fail becomes “rewrite article” | Hypothesis on taxonomy; Fact that only severity enums exist |

---

## 5. Top 10 improvements by ROI

| # | Improvement | Expected effect |
|---|---|---|
| 1 | Patch / section remediation for MINOR | Preserve 80%+ of good draft |
| 2 | Align bars or make Final a delta lock after Editorial≥85 + Fact PASS | Stop 85→MINOR loops |
| 3 | Keep best-scoring candidate; reject regressing rewrites | Force non-decreasing quality |
| 4 | Split budgets: editorial-remediation / final-remediation / gold-bar | Prevent cross-burning attempts |
| 5 | Require explicit preserve list in remediation prompts | Reduce drift |
| 6 | After Final MINOR, re-verify only Required Revisions + affected claims | Cheaper, stabler loops |
| 7 | Disable auto-ack when score drops vs previous Editorial | Human brake on divergence |
| 8 | Typed defects: `STRUCTURE`, `CLAIM`, `EVIDENCE_LOCK`, `STYLE` | Route to right repair tool |
| 9 | Narrow Final rubric to lock/evidence/open-actions; keep craft in Editorial | Reduce double judging |
| 10 | Trajectory objective in protocol: convergence rate, not only first-pass | Align measurement with goal |

---

## 6. Quick Wins (< 1 day)

1. **Prompt-only:** For MINOR, forbid structural rewrite; require “change ≤ N sections; keep title/insight/outline unless listed”.
2. **Prompt-only:** After Editorial≥85 + Fact PASS, Final must not emit MINOR for craft nits already allowed by near-miss policy (already partially in prompt; harden).
3. **Contract:** Treat Final total 85–86 after Editorial 85 + Fact PASS + gates PASS as near-miss eligible **or** raise Editorial bar to 87 — pick one.
4. **Control:** If new Editorial score < previous Editorial score − K, mark remediation failed without accepting draft (**Hypothesis threshold K=5**).
5. **Telemetry product rule:** Dashboard flag “score regression loop” when monotonic decrease ≥2 steps.

## 7. Medium improvements

1. Section-level patch protocol (JSON patch or fenced section replace).
2. Split remediation budgets by failure class.
3. Final Verification delta mode (Required Revisions only + Fact lock).
4. Human review re-entry when regression detected.
5. Defect taxonomy in machine-readable review output.

## 8. Major redesign

See `ai-tfes-v2-proposal.md`: Candidate Lock Architecture, typed repair agents, verifier-only Final, non-decreasing objective.

---

## 9. If only three changes to improve convergence

1. **Stop full-rewrite MINOR remediation** — switch to constrained section patch.
   *Why:* Production collapse happens after MINOR from Final, not from Fact failure.
2. **Introduce best-candidate lock + anti-regression.**
   *Why:* Without memory of the 85 article, the system cannot converge; it can only resample.
3. **Make Final a lock/delta gate after Editorial PASS + Fact PASS**, or align bars so 85 cannot ping-pong.
   *Why:* The observed kick into the death spiral is Final 85 MINOR after Editorial 85 PASS.

These three attack the proven causal chain; they do not require a full multi-agent rewrite of Research/Write.

---

## 10. Scores

| System | Score | Rationale |
|---|---:|---|
| **Current AI-TFES** | **5.5 / 10** | Strong staged gates and now-correct orchestration/observability; weak convergence controller and rewrite-based remediation. Production trajectory fails the product goal. |
| **Proposed AI-TFES v2** | **8.0 / 10** | If Candidate Lock + typed patch + anti-regression are implemented; score assumes execution quality, not vaporware. |

---

## 11. The single bottleneck

**Full-draft rewrite remediation under a second global judge (Final) is the largest bottleneck preventing AI convergence.**

Everything else — telemetry, parsers, retries, Fact loop — now works well enough to reveal this AI-pipeline failure clearly.
