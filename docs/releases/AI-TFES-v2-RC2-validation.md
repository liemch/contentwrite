# AI-TFES v2 RC2 — Production Validation Kit

**Release:** RC2 (RC1 controls + WP-PV2-01 Prompt Architecture trio)  
**Date:** 2026-08-07  
**Default runtime:** `promptArchitecture.enabled=false` → v1.6  
**Goal:** Preview → Canary → Production decision with measured KPIs

Related: [ai-tfes-v2-rc2.md](./ai-tfes-v2-rc2.md), [WP-PV2-01](../work-packages/WP-PV2-01-prompt-trio-migration.md)

---

## 1. Rollout strategy

| Stage | Scope | Flags | Exit gate |
|-------|-------|-------|-----------|
| **Preview** | Isolated Preview DB only; no production articles | RC2 Preview set below | Smoke + cohort A dry-run ≥ 3 articles green; rollback OFF verified |
| **Canary** | ≤10% new articles OR tagged cohort IDs | Same flags on one production deployment slice | Cohort A+B KPI thresholds met; no P0; rollback drill OK |
| **Production** | Full traffic | Keep flags ON only after canary GO | Full KPI pack + 7-day monitoring clear |

**Hard rules**

- Never point Preview AI runs at production `DATABASE_URL`.
- Do not enable RC2 on production until Preview rollback drill passes.
- One config change per canary step; record deploy SHA.

### Recommended Preview / Canary flags

```text
bestCandidateLock.enabled = true
bestCandidateLock.epsilon = 0
falseFinalMinorGuard.enabled = true
regressionAutoAckBrake.enabled = true
promptArchitecture.enabled = true
# minorPreservePrompt may stay OFF — minor-remediation@2.0 already embeds preserve contract
```

### Rollback (immediate)

```text
promptArchitecture.enabled = false
```

Optional full RC1 undo if needed:

```text
bestCandidateLock.enabled = false
falseFinalMinorGuard.enabled = false
regressionAutoAckBrake.enabled = false
```

No migration, artifact wipe, or parser removal required.

---

## 2. Canary plan

1. Tag canary articles with desk note `rc2-canary`.
2. Run Cohorts A → B → C (see §3). Prefer sequential: A smoke, then B regression, then C diversity.
3. Export remediation metrics filtered to `aiTfesVersion=v2-rc2` and `promptArchitectureVersion=2.0`.
4. Compare against a matched v1.6 control set when available (`promptArchitecture.enabled=false` on sibling articles of similar type).
5. **Abort canary** if any of: publish of blocking residual, rollback OFF fails, login/admin blocked, malformed rate > acceptance, or revision-exhausted spike unexplained.

---

## 3. Cohort plan

### Cohort A — 10 bài mới

Fresh topics only. Validates first-pass editorial + lock path without legacy exhaustion bias.

| # | Intent |
|---|--------|
| A1–A4 | Evergreen how-to / explainers |
| A5–A7 | News-adjacent / time-sensitive claims |
| A8–A10 | Opinion/analysis with insight floor pressure |

**Pass signal:** ≥7/10 reach `FINAL_REVIEWED` without revision exhausted; machine-readable ≥ acceptance.

### Cohort B — 10 bài từng exhausted

Replay or re-run articles that previously hit revision exhaustion / false Final MINOR / 85→63 trajectory under v1.6 or RC1-off.

**Pass signal:** Exhaustion rate down vs historical; Best Candidate Lock retains best draft; no publish of unresolved blocking residual.

### Cohort C — Diversity mix

| Slot | Profile | Count |
|------|---------|-------|
| C-short | ≤800 words | 2 |
| C-long | ≥2,000 words | 2 |
| C-technical | Specs, APIs, numbers, citations | 3 |
| C-evergreen | Timeless evergreen | 3 |

**Pass signal:** No single profile dominates failures; context clipping / `CONTEXT_INCOMPLETE` stays rare and does not open spurious MINOR loops.

---

## 4. Official KPIs

Definitions for RC2 Production Validation. Report per cohort and overall.

| KPI | Definition | Primary source |
|-----|------------|----------------|
| **Editorial PASS** | Share of articles reaching `EDITORIAL_REVIEWED` (≥85, insight/gates OK) in the measured run | Workflow state + editorial telemetry |
| **First-pass rate** | Share that reach `FINAL_REVIEWED` with **zero** remediation cycles after first Editorial PASS + Fact PASS | Transition timeline |
| **False Final MINOR** | Final path would have forced craft-only MINOR despite Editorial PASS + Fact PASS; suppressed by Lock LOCKED / guard | `finalMinorSuppressed` + lock `optionalPolishActions` |
| **Revision Exhausted** | Share hitting remediation attempt cap without publish | Exhaustion transitions / errorMessage |
| **Average remediation** | Mean remediation cycles per article (MINOR/MAJOR/REWRITE that change draft) | Telemetry transitions |
| **Candidate regression** | Share of post-revision editorial scores &lt; prior editorial score (ε=0 under Candidate Lock) | Convergence metrics |
| **Manual recovery** | Share needing human draft patch / Human Review brake | Manual recovery + brake events |
| **Token/article** | Sum of approximate input token estimates across prompt telemetry for the article run | `prompt.inputTokenEstimate` |
| **Latency/article** | Wall time from first pipeline LLM to terminal state (or exhaustion) | `llmMs` sums + article timestamps |
| **Human intervention** | Manual recovery ∪ Human Review ∪ admin force actions | Desk / transitions |
| **Machine-readable rate** | Share of Editorial / Lock events with valid machine contract | `machineReadable` / malformed counters |

### Suggested Preview acceptance (directional — confirm after A)

| KPI | Preview target |
|-----|----------------|
| Editorial PASS | ≥ 0.70 |
| First-pass rate | ≥ 0.40 |
| False Final MINOR (unsuppressed craft-only) | ≤ 0.10 |
| Revision Exhausted | ≤ historical − 20% relative or ≤ 0.20 absolute |
| Candidate regression (with lock ON) | ≤ 0.05 accepted regressions |
| Machine-readable (editorial + lock) | ≥ 0.90 |
| `CONTEXT_INCOMPLETE` → spurious MINOR | **0** (must retry/block, not remediate) |

Canary/Production thresholds: freeze after Preview, do not raise mid-canary.

---

## 5. Feature flags & rollback verification

| Flag | OFF behavior | ON behavior |
|------|--------------|-------------|
| `promptArchitecture.enabled` | All three call sites use v1.6 prompts + parsers; `aiTfesVersion` not forced to `v2-rc2` by this flag | Trio `@2.0` for editorial-diagnosis, minor-remediation (MINOR only), lock-verifier |
| `bestCandidateLock.enabled` | Accept-always remediations | Reject regressions; keep best |
| `falseFinalMinorGuard.enabled` | No craft-only suppress | Suppress craft-only Final MINOR when preconditions hold |
| `regressionAutoAckBrake.enabled` | No auto Human Review brake | Brake on regression pattern |

### Rollback drill (required before Canary GO)

1. With RC2 ON, complete ≥1 article mid-pipeline or post-lock.
2. Set `promptArchitecture.enabled=false` and redeploy/restart config.
3. Confirm next Editorial / MINOR / Final steps emit v1.6 prompts (`promptArchitectureVersion=1.6` or absent v2 contract).
4. Confirm no hard import/runtime error requiring RC2.
5. Confirm parsers still accept v1.6 `PROVISIONAL_*` / `FINAL_*` and ignore leftover v2 artifacts safely.

**Verified in code (audit):** registry returns v1.6 with `fallbackReason: "disabled"` when OFF; workflow gates on `descriptor.promptVersion`; no schema dependency on RC2.

---

## 6. Production checklist

### Pre-Preview

- [ ] Deploy SHA recorded
- [ ] Preview DB isolated from production
- [ ] `SESSION_SECRET` / auth env valid; admin can log in
- [ ] Flags set to Preview set; `promptArchitecture.enabled=true` only on Preview
- [ ] Metrics report script runnable
- [ ] Rollback OFF drill planned

### Preview run

- [ ] Cohort A (≥3 smoke, then full 10)
- [ ] Editorial v2 typed defects parse
- [ ] Lock LOCKED on Editorial PASS + Fact PASS + optional polish
- [ ] Blocking residual does not publish
- [ ] MINOR preserve: title/thesis/outline hold when only local defects
- [ ] Candidate Lock rejects 85→63-style drop when enabled
- [ ] `CONTEXT_INCOMPLETE` retries/blocks — does not open MINOR loop
- [ ] Flag OFF restores v1.6

### Canary

- [ ] Cohorts B + C
- [ ] KPI pack vs targets
- [ ] Malformed / token / latency monitored
- [ ] No unexplained exhaustion spike
- [ ] Login + admin desk usable throughout

### Production GO

- [ ] Canary GO recorded
- [ ] Monitoring dashboards/alerts owner named
- [ ] Rollback owner + 15-minute RTO for flag OFF

---

## 7. Monitoring

Watch during Preview/Canary:

- `aiTfesVersion` mix (`v1.6` / `v2-rc1` / `v2-rc2`)
- `promptArchitectureVersionEvents` (`1.6` vs `2.0`)
- `promptContextById` — chars, reduction ratio, malformed by prompt id
- Final / editorial score comparisons (lock-v2 telemetry score = prior editorial score for cohort continuity)
- Exhaustion, Human Review, manual recovery counts
- Auth: login 401 spike (may indicate wrong DB / inactive user — see §9)

Abort if: publish of fact-failed content, persistent malformed lock, or rollback drill fails.

---

## 8. Acceptance criteria (RC2 Preview GO)

**READY FOR RC2 PREVIEW** when all are true:

1. Default OFF; no production behavior change until flag ON.
2. Rollback OFF restores v1.6 with no RC2 hard dependency.
3. Parsers fail-safe on malformed v2 (no spurious PASS).
4. Lock `CONTEXT_INCOMPLETE` does not route into MINOR remediation.
5. Lock telemetry exposes comparable score for cohort metrics (editorial carry-forward).
6. Validation kit + cohorts + KPIs documented (this file).
7. Auth path usable for operators (or environmental login issue diagnosed).

**Canary / Production** require measured cohort KPIs — not granted by engineering audit alone.

---

## 9. Login note (operator access)

Login returns the same 401 text for missing/inactive user and bcrypt mismatch (`Email hoặc mật khẩu không đúng`).

For “old account” failures, check in order:

1. **Wrong DB** — Preview vs Production `DATABASE_URL`.
2. **`active=false`**.
3. **Multi-user migration** — must use email + per-user password (not legacy password-only).
4. **`admin@local` → `ADMIN_EMAIL`** migration may rename email and re-hash from current `ADMIN_PASSWORD`.
5. **Env password changed** after seed without Users-panel reset.
6. Bootstrap now trims `ADMIN_PASSWORD` before hash (whitespace mismatch fix).

Not an RC2 pipeline blocker unless operators cannot access Preview/Canary admin.

---

## 10. Release scorecard

| Dimension | Score (0–10) | Notes |
|-----------|--------------|-------|
| Engineering | 8 | Trio behind flag; CI coverage; P1 telemetry/state fixes applied |
| Architecture | 8 | Additive contracts; v1.6 retained; no schema/state rewrite |
| Prompt System | 7 | Registry + trio shipped; full context reduction deferred (TODO) |
| Reliability | 7 | Fail-safe parsers; Candidate Lock / guards available; cohort unproven |
| Observability | 8 | Prompt + remediation telemetry + metrics; lock score carry-forward |
| Rollback | 9 | Single flag OFF → v1.6; no migration |
| Production Readiness | 6 | Preview-ready; Canary/Prod need measured cohorts |
| Security | 7 | No new attack surface in prompts; auth env/DB hygiene operational |
| Maintainability | 6 | `workflow.ts` still large (TODO); registry keeps prompt surface bounded |

**Stage readiness**

| Stage | Status |
|-------|--------|
| Preview | **GO** — READY FOR RC2 PREVIEW |
| Canary | **HOLD** — pending Cohort A–C KPI evidence |
| Production | **HOLD** — pending canary GO + monitoring window |

---

## 11. Audit outcomes (RC2)

### Fixed for Production Validation (P1)

- Lock-v2 final telemetry now carries prior editorial score so cohort final comparisons are not null.
- `CONTEXT_INCOMPLETE` retries/blocks via format-invalid path; not mapped to MINOR decision.
- Bootstrap `ADMIN_PASSWORD` trim to reduce env-whitespace login mismatch.

### TODO (optimization — not PV blockers)

- Stronger MINOR context reduction (still embeds full-draft compatibility block).
- Lock `maxTokens=1500` vs v1.6 2200 — watch malformed rate.
- Decompose `workflow.ts` after benchmark seam (existing TODO).
- Align docs that still imply password-only admin login.

### Non-goals (explicitly out of RC2)

Prompt v2.1, Patch Editing, Typed Defect Router, Multi-agent, architecture redesign.
