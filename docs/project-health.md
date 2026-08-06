# Project Health — ContentWrite

> Post-WP2 snapshot: 2026-08-06  
> Chi tiết evidence: [audit/post-wp2-assessment.md](./audit/post-wp2-assessment.md)

## Health score

**7.0/10 — MVP production cho cá nhân; Beta cho nhóm nhỏ.**

| Dimension | Score | Signal |
|---|---:|---|
| Product value | 7.7 | Editorial workflow khác biệt, chưa có PMF metrics |
| Architecture | 6.8 | Modular monolith hợp lý; core workflow coupling cao |
| Code quality | 6.2 | Guards/helpers tốt hơn; lint debt và god file còn |
| Maintainability | 5.6 | Docs/CI tốt; core khó thay đổi an toàn |
| Security | 7.8 | IDOR/session/secrets được cải thiện; dependency CVEs |
| Multi-user isolation | 7.2 | CRUD ownership đúng; Series draft metadata/assignment gap |
| Database safety | 6.8 | Versioned migration; live production chưa verify |
| Deployment safety | 7.3 | Build không mutate DB; migration operator-controlled |
| Vercel compatibility | 7.0 | Build/serverless guards tốt; jobs dài chưa phù hợp |
| Testing | 4.3 | 27 unit tests, không route/workflow integration |
| CI | 6.8 | Gate đầy đủ nhưng lint có warning budget/scripts gap |
| Reliability | 5.2 | State machine/audit tốt; cron continuation yếu |
| Performance | 5.0 | Chưa benchmark, static smells còn |
| Observability | 2.7 | Thiếu error tracking/metrics/alerts |
| Scalability | 4.8 | Chưa có evidence cho concurrent AI |
| Production readiness | 6.8 | Có runbook; backup/migration/smoke evidence thiếu |

## Work package verification

| WP | Đánh giá | Kết luận |
|---|---|---|
| WP0-A | Ownership/authZ/secret/editorial scope có code evidence | **Partial residual**: Series draft metadata + assignment gap; rate limit per-instance |
| WP0-B | DB-backed session + password response + tab fix có evidence | **Substantially complete**; legacy JWT thiếu `sv` residual |
| WP1 | Safe build + migrations + runbook có thật | **Complete in source, incomplete operational verification** |
| WP2 | CI/offline build/Preview paid-side-effect guard có thật | **Complete with quality gaps**: lint budget, no integration tests, Preview CRUD |

## Current gate results

| Gate | Result |
|---|---|
| Test | 27/27 pass |
| TypeScript | Pass |
| Prisma validate | Pass |
| Lint CI | Pass with 11 warnings |
| Dependency audit | Fail: 4 High advisories |
| Git worktree before assessment | Clean |
| Remote GitHub CI | Cannot verify (`gh` unavailable) |
| Production migration / backup | Cannot verify (no access) |

## Readiness by use case

| Use case | Readiness | Điều kiện |
|---|---|---|
| Cá nhân | **MVP production** | Verify DB/env/backup; auto-write manual accepted |
| Nhóm 5–20 | **Controlled Beta** | Fix Series gaps, Preview DB, monitoring, integration tests, CVE patch |
| 50–100 users | **Not ready** | Load evidence, observability, quota/concurrency controls |
| Concurrent AI workflows | **Not ready** | Reliable jobs/leases or proven bounded continuation |

## Product health

### Strongest proven value

- State-driven editorial workflow instead of one-shot chat.
- Immutable artifacts + transitions for traceability.
- Human review, fact verdict, approval, correction/retraction.
- Editorial memory and series-aware deduplication.

### Biggest unproven assumptions

- AI-TFES improves final quality enough to offset complexity.
- Editors understand and complete the workflow without heavy support.
- Auto-write is important enough to prioritize infrastructure.

### Metrics needed next

1. Workflow completion rate and time-to-publish.
2. Fail/retry/human-intervention count per state.
3. Editor score and acceptance rate.
4. AI cost per published article.
5. Week-1/week-4 editor retention and onboarding time.

## Decision

Continue the **modular monolith**. Do not introduce microservices/queue infrastructure without measured demand. Use an interleaved loop:

1. One small production assurance/reliability improvement.
2. One onboarding/product experiment.
3. Measure completion, quality, cost and failure.
4. Reprioritize.

Next decision detail: [next-step-recommendation.md](./next-step-recommendation.md).
