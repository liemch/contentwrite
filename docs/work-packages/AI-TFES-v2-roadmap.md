# AI-TFES v2 — Work Package Catalog

**Date:** 2026-08-07
**Status:** Catalog / planning only — no implementation WP opened here
**Parent roadmap:** `docs/architecture/ai-tfes-v2-roadmap.md`
**Non-goals:** Do not implement AI-TFES v2 in this document. Do not merge with WP-E0A.

Each WP below is sized to be independently deployable and rollbackable.

---

## Global rules for every WP

- Feature flag or prompt-version gate when behavior changes.
- No production migration unless the WP explicitly says so (default: **none**).
- Additive telemetry preferred; never remove existing WP2.7 fields in the same WP.
- Cohort before calling a Hypothesis “proven”.
- If success cannot be shown with production telemetry → mark **Experimental**.

---

## WP-V2-01 — Convergence KPI Telemetry

| Field | Content |
|---|---|
| **Status** | **Implemented technically — production cohort pending** |
| **Mục tiêu** | Đo hội tụ: score deltas, regression loops, Final false-MINOR precondition events |
| **Root cause** | Không đo được convergence dù timeline đã thấy 85→63→56 (**Evidence**) |
| **Class** | Implement-now |
| **Files dự kiến** | `remediation-telemetry.ts`, `workflow.ts` (editorial/final/remediate details only), `remediation-metrics.mjs`, `docs/validation/remediation-metrics.md`, tests under `web/src/lib/validation/` / `tfes/` |
| **Migration?** | No |
| **Schema?** | No (JSONB `details.telemetry` additive) |
| **Prompt?** | No |
| **Telemetry?** | Yes — `previousEditorialScore`, `scoreDelta`, `scoreRegression`, `finalAfterEditorialPassFactPass`, `acceptedDespiteRegression` |
| **Tests** | Serialization; metrics aggregation fixtures; no live AI/DB |
| **Risk** | Low |
| **Rollback** | Stop writing new fields; reports ignore missing keys |
| **Expected KPI** | Denominators populated for monotonicity / false-MINOR / regression rates |
| **Priority** | Highest |

---

## WP-V2-02 — Best Candidate Lock

| Field | Content |
|---|---|
| **Status** | **Implemented technically — flag disabled; production cohort pending** |
| **Mục tiêu** | Không chấp nhận draft remediation nếu editorial score giảm quá ε so với best candidate trong cycle |
| **Root cause** | Hệ thống chấp nhận 63/56 sau khi đã có ứng viên 85 (**Evidence**) |
| **Class** | Evidence; ε tuning = A/B required |
| **Files dự kiến** | `workflow.ts` (revision-remediate accept path), `remediation-budget.ts` or new `candidate-lock.ts`, telemetry, metrics, flag in settings/env |
| **Migration?** | No |
| **Schema?** | No — best snapshot in transition details and/or article deskJson additive |
| **Prompt?** | No (controller is deterministic) |
| **Telemetry?** | Yes — `bestEditorialScore`, `rejectedRegression`, `keptCandidate` |
| **Tests** | Unit: accept/reject matrix; wiring; metrics counts |
| **Risk** | Low–medium (may reject noisy ±1 swings if ε=0) |
| **Rollback** | Feature flag off → current accept-always behavior |
| **Expected KPI** | Candidate regression rate ↓; exhaustion may shift to “kept best + human”; monotonicity ↑ |
| **Priority** | Highest |
| **Depends on** | WP-V2-01 strongly recommended first |

---

## WP-V2-03 — False Final MINOR Guard

| Field | Content |
|---|---|
| **Status** | **Implemented technically — RC1 flag disabled; cohort pending** |
| **Mục tiêu** | Khi Editorial≥85 + gate0 + Fact PASS, chặn Final craft-only MINOR đẩy vào full revision rewrite |
| **Root cause** | Editorial 85 PASS → Fact PASS → Final 85 MINOR khởi động death spiral (**Evidence**) |
| **Class** | Evidence; choose variant via A/B |
| **Variant A** | Expand near-miss accept when precondition holds (runtime) |
| **Variant B** | Raise editorial minimum toward 87–90 (contract) |
| **Variant C** | Final may emit PATCH_REQUIRED residuals but not `MINOR_REVISION_REQUIRED` for craft when precondition holds (prompt+runtime) |
| **Files dự kiến** | `contract.ts`, `final-verification.ts`, `prompts.ts` (`finalize-verify`), tests, docs |
| **Migration?** | No |
| **Schema?** | No |
| **Prompt?** | Yes (clarify lock vs craft) |
| **Telemetry?** | Yes — `falseMinorSuppressed`, chosen variant id |
| **Tests** | Final inspector fixtures for 85/87/90 bands under precondition |
| **Risk** | Medium — may publish slightly weaker craft; mitigate with human polish still available |
| **Rollback** | Revert contract/prompt flag to v1.6 bands |
| **Expected KPI** | Final false-MINOR rate ↓; fewer revision attempts after Fact PASS |
| **Priority** | Highest |
| **Depends on** | WP-V2-01 for measurement |

---

## WP-V2-04 — MINOR Preserve Prompt

| Field | Content |
|---|---|
| **Status** | **Implemented technically — RC1 flag disabled; cohort pending** |
| **Mục tiêu** | Prompt MINOR cấm đổi title/outline/insight trừ khi listed; yêu cầu liệt kê UNCHANGED sections |
| **Root cause** | MINOR vẫn full-rewrite medium (**Evidence**); preserve text may reduce damage (**Hypothesis** until A/B) |
| **Class** | Implement-now prompt; success = A/B |
| **Files dự kiến** | `prompts.ts` (`finalize-revision-remediate`), optional post-check hash helper later |
| **Migration?** | No |
| **Schema?** | No |
| **Prompt?** | Yes |
| **Telemetry?** | Optional unchanged-section parse rate |
| **Tests** | Prompt wiring contains preserve rules; no live AI |
| **Risk** | Low — model may ignore; without checksum enforce it's soft |
| **Rollback** | Restore previous prompt string |
| **Expected KPI** | Smaller score drops after MINOR; not sufficient alone |
| **Priority** | High |
| **Experimental?** | Effectiveness Experimental until cohort; shipping prompt is Implement-now |

---

## WP-V2-05 — Regression Auto-ack Brake

| Field | Content |
|---|---|
| **Status** | **Implemented technically — RC1 flag disabled; cohort pending** |
| **Mục tiêu** | Tắt auto-ack post-revision khi editorial score giảm; bắt buộc human hoặc giữ best |
| **Root cause** | Auto-ack cho phép vòng xoáy không phanh (**Evidence**) |
| **Class** | Evidence / A/B on completion impact |
| **Files dự kiến** | `workflow.ts` post-revision review branch, human-review UI copy, telemetry |
| **Migration?** | No |
| **Schema?** | No |
| **Prompt?** | No |
| **Telemetry?** | `autoAckSuppressedForRegression` |
| **Tests** | Branch tests with mocked scores/marks |
| **Risk** | Medium — more human pauses |
| **Rollback** | Flag off |
| **Expected KPI** | Regression loops interrupted; measure completion latency |
| **Priority** | High |
| **Depends on** | WP-V2-01; pairs well with WP-V2-02 |

---

## WP-V2-06 — Split Revision Budgets

| Field | Content |
|---|---|
| **Mục tiêu** | Tách budget: editorial-remediation / final-remediation / gold-bar |
| **Root cause** | 3 attempts dùng chung cho nhiều lớp lỗi (**Evidence**) |
| **Class** | Evidence |
| **Files dự kiến** | `remediation-budget.ts`, `retry-policy.ts`, `workflow.ts`, metrics docs |
| **Migration?** | No |
| **Schema?** | No — distinguish by transition cause in details |
| **Prompt?** | No |
| **Telemetry?** | `budgetClass`, per-class counts |
| **Tests** | Budget cycle tests per class |
| **Risk** | Medium — may increase total LLM calls |
| **Rollback** | Flag restore unified budget |
| **Expected KPI** | Fewer premature exhaustions from mixed causes; clearer class-level rates |
| **Priority** | Medium-High |

---

## WP-V2-07 — Section Patch MVP (MINOR only)

| Field | Content |
|---|---|
| **Mục tiêu** | MINOR remediation xuất/apply section patches thay vì full Article.md |
| **Root cause** | Full rewrite destroys candidate (**Evidence**); patch superiority (**A/B required**) |
| **Class** | Experimental until cohort proves KPI lift |
| **Files dự kiến** | new `section-patch.ts`, `prompts.ts`, `workflow.ts` remediate branch, parser tests, flag |
| **Migration?** | No |
| **Schema?** | No |
| **Prompt?** | Yes — patch output contract |
| **Telemetry?** | `remediationMedium=patch|rewrite`, sectionsTouched, applySuccess |
| **Tests** | Apply/rollback fixtures; refuse patch outside allowlist; fallback path |
| **Risk** | Medium–high — apply bugs; mitigate fallback to rewrite + flag |
| **Rollback** | Flag → legacy full rewrite |
| **Expected KPI** | Patch success rate; monotonicity ↑; regression rate ↓ vs control |
| **Priority** | Medium-High |
| **Depends on** | WP-V2-01, recommended WP-V2-02 |
| **Experimental?** | **Yes** |

---

## WP-V2-08 — Final Delta Lock Mode

| Field | Content |
|---|---|
| **Mục tiêu** | Sau Editorial PASS + Fact PASS, Final chỉ chấm residuals/open actions/insight floor trên delta |
| **Root cause** | Second global judge triggers rewrite (**Evidence**); delta safety (**A/B**) |
| **Class** | A/B; Experimental until proven |
| **Files dự kiến** | `prompts.ts` (`finalize-verify`), `final-verification.ts`, workflow context assembly |
| **Migration?** | No |
| **Schema?** | No |
| **Prompt?** | Yes |
| **Telemetry?** | `finalMode=full|delta`, residualCodes |
| **Tests** | Inspector fixtures; prompt wiring |
| **Risk** | Medium–high miss of cross-section issues |
| **Rollback** | Flag → full Final |
| **Expected KPI** | False-MINOR ↓; lock pass rate ↑ without quality complaints |
| **Priority** | Medium |
| **Depends on** | WP-V2-03 and/or WP-V2-07 |
| **Experimental?** | **Yes** |

---

## WP-V2-09 — Typed Defect Schema

| Field | Content |
|---|---|
| **Mục tiêu** | Editorial/Final machine output thêm defect types: STRUCTURE/CLAIM/EVIDENCE/STYLE/REWRITE |
| **Root cause** | Severity-only routing forces rewrite (**Evidence** of coarse routing); taxonomy value (**Hypothesis**) |
| **Class** | Hypothesis / Experimental |
| **Files dự kiến** | `editorial-review-gate.ts`, `final-verification.ts`, `prompts.ts`, Review template, telemetry |
| **Migration?** | No |
| **Schema?** | No |
| **Prompt?** | Yes |
| **Telemetry?** | defect type histogram |
| **Tests** | Parser fixtures |
| **Risk** | Medium — model mislabels types |
| **Rollback** | Ignore unknown fields |
| **Expected KPI** | Better routing into patch vs rewrite; only valuable after WP-V2-07 |
| **Priority** | Medium |
| **Experimental?** | **Yes** |

---

## WP-V2-10 — Partial Fact Invalidation

| Field | Content |
|---|---|
| **Mục tiêu** | Patch/rewrite chỉ invalidate claim ids giao với section đụng |
| **Root cause** | Revision clears entire `factCheck` (**Evidence**); partial invalidation benefit (**Hypothesis**) |
| **Class** | Hypothesis / Experimental |
| **Files dự kiến** | `fact-ledger.ts`, workflow remediate/patch paths, claim id stability |
| **Migration?** | No |
| **Schema?** | No |
| **Prompt?** | Maybe claim-id stability instructions |
| **Telemetry?** | claimsInvalidated count |
| **Tests** | Invalidation set fixtures |
| **Risk** | Medium — stale supported claims |
| **Rollback** | Clear full ledger as today |
| **Expected KPI** | Fewer full Fact re-runs; Fact first-pass after patch ↑ |
| **Priority** | Lower near-term |
| **Depends on** | WP-V2-07, WP-V2-09 |
| **Experimental?** | **Yes** |

---

## WP-V2-11 — Constrained Rewrite Agent

| Field | Content |
|---|---|
| **Mục tiêu** | REWRITE path bắt buộc preserve-mask + checksum verify |
| **Root cause** | REWRITE tier abandons wording (**Evidence**) |
| **Class** | Experimental |
| **Files dự kiến** | prompts, patch/rewrite apply, candidate lock integration |
| **Migration?** | No |
| **Schema?** | No |
| **Prompt?** | Yes |
| **Telemetry?** | preserveMaskViolations |
| **Tests** | Checksum enforcement |
| **Risk** | Medium |
| **Rollback** | Flag |
| **Expected KPI** | Less collapse on necessary rewrites |
| **Priority** | Lower |
| **Depends on** | WP-V2-02, WP-V2-07 |
| **Experimental?** | **Yes** |

---

## WP-V2-12 — Multi-specialist Router

| Field | Content |
|---|---|
| **Mục tiêu** | Router tách Diagnoser / Patcher / Lock Verifier thành agents riêng |
| **Root cause** | Coupled generate+judge roles (**Hypothesis** as primary) |
| **Class** | Experimental — **do not start in first 2 weeks** |
| **Files dự kiến** | Large orchestration surface in `workflow.ts` / new modules |
| **Migration?** | Likely none first; avoid schema rename initially |
| **Schema?** | Avoid |
| **Prompt?** | Yes — many |
| **Telemetry?** | Per-agent latency/error |
| **Tests** | Heavy |
| **Risk** | High complexity / regression |
| **Rollback** | Difficult — keep flag isolating router |
| **Expected KPI** | Only after 01–08 baselines exist |
| **Priority** | Lowest near-term |
| **Experimental?** | **Yes** |

---

## Dependency graph

```text
WP-V2-01 KPI Telemetry
   ├─► WP-V2-02 Best Candidate Lock
   ├─► WP-V2-03 False Final MINOR Guard
   ├─► WP-V2-04 MINOR Preserve Prompt
   └─► WP-V2-05 Regression Auto-ack Brake
          │
          ├─► WP-V2-06 Split Budgets
          └─► WP-V2-07 Section Patch MVP ──► WP-V2-08 Final Delta
                                    └─► WP-V2-09 Typed Defects ──► WP-V2-10 Partial Fact
                                                         └─► WP-V2-11 Constrained Rewrite
                                                                  └─► WP-V2-12 Specialist Router
```

---

## Ranking table (Impact × Value / Risk × Complexity)

| WP | Impact | Prod value | Risk | Complexity | Band | Ship in first 2 weeks? |
|---|---:|---:|---:|---:|---|---|
| V2-01 | 5 | 5 | 1 | 2 | Highest | **Yes** |
| V2-02 | 5 | 5 | 2 | 3 | Highest | **Yes** |
| V2-03 | 5 | 5 | 2 | 2 | Highest | **Yes** |
| V2-04 | 3 | 4 | 1 | 1 | High | **Yes** |
| V2-05 | 4 | 4 | 2 | 2 | High | **Yes** |
| V2-06 | 3 | 3 | 2 | 3 | Medium-High | Only if 01–05 done early |
| V2-07 | 5 | 4 | 3 | 4 | Medium-High | **No** (start week 3+) |
| V2-08 | 4 | 4 | 3 | 3 | Medium | No |
| V2-09 | 3 | 3 | 3 | 3 | Medium | No |
| V2-10 | 3 | 2 | 3 | 4 | Lower | No |
| V2-11 | 3 | 2 | 3 | 4 | Lower | No |
| V2-12 | 2 | 2 | 5 | 5 | Lowest | No |

---

## Two-week plan (authoritative)

Exact WPs to do first for maximum convergence lift:

1. **WP-V2-01** Convergence KPI Telemetry
2. **WP-V2-02** Best Candidate Lock
3. **WP-V2-03** False Final MINOR Guard
4. **WP-V2-04** MINOR Preserve Prompt
5. **WP-V2-05** Regression Auto-ack Brake

Then **measure** a cohort before opening WP-V2-07 Patch MVP.

This matches the architecture bottleneck:

> Full-draft rewrite under a second global judge destroys the last good candidate.

Controllers + false-MINOR guard stop the bleed; patch editing comes next once the bleed is measurable and contained.
