# AI-TFES v2 Proposal — Candidate Lock Architecture

**Role:** Principal AI Architect
**Date:** 2026-08-07
**Companion:** `ai-tfes-architecture-review.md`
**Goal:** Keep the business goal — production-quality articles — while making iterative refinement converge.
**Constraint:** Redesign AI pipeline; no obligation to preserve current phase compatibility.

**Motivation from production (Fact):**

```text
Rev#1 → Editorial 85 PASS / gate0 → Fact PASS
  → Final 85 MINOR
  → Rev#2 → Editorial 63 MAJOR
  → Rev#3 → Editorial 56 REWRITE
  → exhausted
```

Software loops are correct (WP2.5–WP2.7.1). The update rule is not.

---

## 1. Design principles

1. **Preserve the best candidate.** Never replace a higher-scoring draft with a lower one unless a human overrides.
2. **Repair the defect, not the article.** Typed defects route to typed tools.
3. **One global judge before lock; one lock judge after.** Stop double-scoring the same craft surface.
4. **Verify the delta.** Re-run only contracts affected by the patch.
5. **Rewrite is escalation, not default.** Full regeneration requires preserve-mask and budget of its own.
6. **Observability is a first-class convergence metric.** Track score delta per cycle, not only pass/exhaust rates.

---

## 2. Proposed pipeline

```text
Research Packet
    ↓
Insight / Planning Lock
    ↓
Draft Candidate v0
    ↓
Editorial Diagnosis (typed defects + provisional score)
    ↓
[optional] Human confirm on first diagnosis
    ↓
Claim Ledger (Fact Check) on frozen candidate
    ↓
Lock Verification (evidence lock + open actions + insight floor)
    ↓
Publish Package
```

### Remediation subgraph (the core redesign)

```text
                    ┌─── defect.STRUCTURE ──► Section Patch Agent
Diagnosis/Lock fail ┼─── defect.CLAIM ──────► Claim Patch Agent
                    ┼─── defect.EVIDENCE ───► Evidence Bind / Hedge Agent
                    └─── defect.REWRITE ────► Constrained Rewrite Agent
                              ↓
                     Patch Candidate vN+1
                              ↓
                     Delta Verifiers (only affected contracts)
                              ↓
              accept if non-decreasing + defects closed
              else keep best candidate / escalate / exhaust
```

### What changes vs v1.6

| v1.6 | v2 |
|---|---|
| Full-draft remediation default | Section/claim patch default |
| Editorial 85 then Final 90 on same checklist | Editorial = craft/structure diagnosis; Lock = evidence/open-actions |
| Shared 3-attempt revision pool | Separate budgets per defect class |
| Post-revision auto-ack always | Auto-ack only if score non-decreasing |
| Fact cleared on every revision rewrite | Fact invalidated only for touched claims/sections |
| Success = eventually pass or exhaust | Success = converge without regression |

---

## 3. Multi-agent design (narrow, not a swarm)

v2 is **tool-routed specialists**, not a chatty multi-agent debate.

| Agent | Input | Output | Forbidden |
|---|---|---|---|
| **Drafter** | Research + Plan | Full Article candidate | Self-scoring as final |
| **Editorial Diagnoser** | Candidate | Typed defect list + provisional score | Rewriting the article |
| **Claim Auditor** | Candidate + Research | Fact ledger | Rewriting narrative voice |
| **Section Patcher** | Candidate + STRUCTURE/CRAFT defects | Patched sections only | Changing untouched sections |
| **Claim Patcher** | Candidate + CLAIM defects | Claim-local edits | Global restyle |
| **Lock Verifier** | Candidate + Fact ledger + open actions | PASS / typed residuals | Craft-only MINOR spam |
| **Constrained Rewriter** | Plan + preserve-mask + defects | New candidate | Ignoring preserve-mask |
| **Controller** (deterministic) | Scores, budgets, best-candidate | Accept / reject / escalate | LLM improvisation |

The Controller is **not** an LLM. It owns convergence.

---

## 4. Prompt architecture

### 4.1 Prompt sequencing

1. Research packet prompt (evidence only)
2. Planning prompt (insight lock)
3. Draft prompt (generation)
4. Diagnosis prompt (no generation of article body)
5. Patch prompts (bounded edit)
6. Lock prompt (verification only)

**Separation rule:** A prompt that diagnoses must not emit Article.md. A prompt that patches must not emit a new global score. A prompt that locks must not invent repairs.

### 4.2 Context packing

For patch agents, CONTEXT order:

1. Defect list (machine JSON)
2. Preserve-mask (sections/claims frozen)
3. Only the target section(s) + local neighbors
4. Minimal evidence excerpts needed for those claims
5. Explicit “do not rewrite Title/Insight unless defect says so”

For lock verifier:

1. Fact ledger status
2. Open required actions
3. Diff summary of patches since last lock
4. Full candidate only if needed for insight floor

This attacks Instruction Dilution at the packing layer (design intent; effectiveness = Hypothesis until measured).

### 4.3 Memory strategy

| Memory | Scope | Use |
|---|---|---|
| Research Packet | Article | Immutable during repair unless research refresh ticket |
| Best Candidate Snapshot | Article | Always retained with score + defect set |
| Defect Log | Article | Append-only across cycles |
| Claim Ledger | Article | Partial invalidation by claim id |
| Editorial Memory | Cross-article | Seeding / style preferences only — not in patch loops |

---

## 5. State transitions (conceptual)

```text
CANDIDATE_DRAFTED
  → DIAGNOSED
  → CLAIMS_AUDITED
  → LOCK_PENDING
  → LOCKED_PUBLISHABLE
  → PUBLISH_PACKAGED
```

Failure side-states:

```text
PATCH_REQUIRED(type)
REWRITE_REQUIRED(preserve-mask)
REGRESSION_REJECTED (keep best)
BUDGET_EXHAUSTED (human recovery)
```

Mapping note: these need not match current Prisma enums 1:1. That is an implementation concern outside this review.

---

## 6. Review loop redesign

### Editorial Diagnoser

- Owns craft, structure, insight provisional score, discussion shape.
- Emits typed defects, not “please rewrite the article.”
- Does **not** consume rewrite budget by itself.

### Lock Verifier (replaces today’s Final-as-global-rejudge)

- Owns: Fact PASSED, blocking claims = 0, open actions = 0, insight floor, evidence lock.
- May fail with typed residuals only.
- Must not send a Fact-passed, Editorial-passed candidate into unconstrained rewrite for a 5-point craft disagreement.

### Production-driven rule

If Editorial provisional ≥85 and Fact PASS, Lock Verifier may request **patches**, not **full revision remediation**, unless insight < floor or evidence lock fails.

---

## 7. Fact Check placement

**Keep Fact after a frozen candidate diagnosis, before lock.**

Additions:

1. Claim ids are stable across patches.
2. Patching a section invalidates only claims intersecting that section.
3. Full Fact re-audit only when rewrite agent runs or claim graph changes > threshold.
4. Fact remediation uses Claim Patcher, not full Article regeneration, by default.

This preserves the proven Fact loop correctness from WP2.7.1 while preventing rewrite from casually discarding a PASSED ledger.

---

## 8. Remediation strategy ladder

| Severity / defect | Strategy | Verification |
|---|---|---|
| Style / local wording | Section patch | Delta Editorial checks on section |
| Claim unsupported | Claim patch / hedge / delete | Re-audit those claim ids |
| Structure missing section | Section insert | Structure checklist only |
| Insight below floor | Constrained rewrite with preserve-mask | Full diagnosis + Fact on touched claims |
| Catastrophic incoherence | New draft v0 under new run id | Fresh budgets; old candidate archived |

**Diff editing** is preferred encoding for patches (search/replace blocks or section fences).
**AST editing** is optional later if Article.md becomes a structured IR.
**Do not** make free full-markdown rewrite the MINOR path.

---

## 9. Convergence controller

Deterministic rules:

1. Store `best = {draft, editorialScore, defectCount, factStatus}`.
2. After each patch/rewrite, compute score/defect delta.
3. If `new.editorialScore < best.editorialScore - ε` → **reject**, keep best, consume attempt as failed experiment.
4. If defects closed and lock contracts pass → accept and promote best.
5. If attempts exhausted → human recovery against **best**, not last failed rewrite.

ε can start at 0 (strict non-decreasing) or 2–3 points; choose via cohort, mark as experiment.

Production trajectory would have rejected 63 and 56, retained the 85 candidate, and asked for a MINOR patch against Final residuals only.

---

## 10. Prompt drift controls

1. Patch prompts forbidden from changing outline unless defect type allows.
2. Preserve-mask echoed back in model output (“UNCHANGED_SECTIONS: …”).
3. Controller verifies unchanged sections by hash/checksum.
4. Severity may escalate only if the **same defect id** remains open after a patch — not because a rewrite created new failures.

---

## 11. Migration posture (non-binding)

Suggested order if later implemented:

1. Quick wins on current prompts/bars/anti-regression (days)
2. Section patch protocol + controller (days–week)
3. Split Final into Lock Verifier (week)
4. Typed defects + partial Fact invalidation (week+)
5. Retire full-rewrite MINOR path entirely

No Work Packages are created in this document.

---

## 12. Success metrics for v2

Must beat current production failure mode:

| Metric | Meaning |
|---|---|
| Score monotonicity rate | % cycles with non-decreasing editorial/lock score |
| Best-candidate retention | % exhausted runs where best ≥ first Editorial pass |
| Patch vs rewrite ratio | Prefer patch |
| False Final MINOR rate | Editorial≥85 + Fact PASS then Lock MINOR for craft-only |
| Convergence within budget | Pass before exhaustion without regression |

WP2.7/2.7.1 telemetry already can measure several of these once patch metadata exists.

---

## 13. Scores and bottleneck

| System | Score |
|---|---:|
| Current AI-TFES | **5.5 / 10** |
| Proposed AI-TFES v2 | **8.0 / 10** |

### Single bottleneck (same as review)

**Full-draft rewrite remediation under a second global judge is the largest bottleneck preventing AI convergence.**

v2 exists to replace that update rule with candidate lock + typed patch + anti-regression control.
