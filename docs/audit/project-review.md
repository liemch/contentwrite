# Project Review — ContentWrite

> Baseline audit (2026-08-06). Re-prioritized for multi-user expansion in [roadmap.md](../roadmap.md).

**Overall grade: C+** — Solid AI-TFES pipeline foundation; risks concentrated in authorization gaps, god files, zero tests, and deploy/migration practices.

---

## Summary by severity (baseline)

| Severity | Technical Debt | Security | Performance | Code Smell |
|----------|----------------|----------|-------------|------------|
| Critical | 4 | 0 | 1 | 2 |
| High | 4 | 4 | 4 | 3 |
| Medium | 7 | 7 | 1 | 9 |
| Low | 3 | 7 | 0 | 5 |

---

## Group A — Must fix before scaling users

| ID | Finding | Severity | Current impact | Multi-user impact | Effort | Decision |
|----|---------|----------|----------------|-------------------|--------|----------|
| SEC-1 | IDOR Digests | High | Any editor CRUD any digest | Cross-user data leak | S | **WP0-A — Done** |
| SEC-2 | IDOR Series + cleanPublish leak | High | Any editor modify series; draft bodies exposed | Severe draft leak | M | **WP0-A — Done** |
| SEC-3 | Dashboard SSR stale JWT role | High | Demoted admin sees all articles on SSR | Wrong workspace visibility | S | **WP0-A — Done** |
| SEC-4 | SESSION_SECRET = ADMIN_PASSWORD fallback | High | Password compromise → JWT forgery | Critical at scale | S | **WP0-A — Done** |
| SEC-6 | Inactive user + JWT | Medium | Deactivated user session | Orphan access window | M | **WP0-B — Done** (residual: client shell) |
| SEC-7 | No login rate limit | Medium | Brute force login | Worse with more accounts | S | **WP0-A — Done** |
| SEC-8 | Open redirect after login | Medium | Phishing vector | Same | S | **WP0-A — Done** |
| SEC-9 | Editorial memory cross-user | Medium | Non-admin sees others' angles | Privacy / competitive leak | S | **WP0-A — Done** |
| SEC-5 | Public `/api/health/integrations` | Medium | Quota + reconnaissance | Cost abuse | S | **WP0-A — Done** |
| SEC-13 | Temp password in API | Low | Password in JSON/logs | Credential leak | S | **WP0-B — Done** |
| TD-3 | `db push` on build | Critical | Non-reproducible schema | Prod drift / data loss risk | M | WP1 |
| TD-4 | Manual SQL vs migrations | Critical | Environment drift | Onboarding failures | M | WP1 |
| SMELL-5 | Invalid tab `"review"` | High | UI bug on failure path | User confusion | S | **WP0-B — Done** |

---

## Group B — Sustainable growth

| ID | Finding | Effort | Decision |
|----|---------|--------|----------|
| TD-1 | God file `workflow.ts` (~2.9k lines) | L | WP5 |
| TD-2 | Zero tests / no CI | M | WP2 |
| TD-5 | Vercel timeout vs auto-write cron gap | M | WP3 |
| TD-6 | Circular import workflow ↔ runner | M | WP5 |
| TD-7 | Dual state representation | M | WP5 |
| PERF-2 | N+1 / full-table scans | M | WP4 |
| PERF-3 | Missing DB indexes | S | WP4 |
| PERF-4 | Large list payloads | S | WP4 |
| SMELL-3 | UI/server orchestration duplicate | L | WP5 |

---

## Group C — Defer

| ID | Finding | Decision |
|----|---------|----------|
| SEC-15 | Bcrypt rounds 10 | Accept until credential policy WP |
| SEC-17 | CSRF tokens (SameSite=Lax only) | Accept for internal app; revisit if third-party embed |
| SEC-13 | Temp password in API response | WP0-B or admin UX WP |
| SMELL-15 | Action string literals | WP5 |
| PERF-7 | Artifact retention | WP4 when DB size measurable |

---

## Positive observations (confirmed from code)

- Article API uses `assertCanAccessArticle` consistently
- Prisma ORM — no raw SQL injection surface found
- Optimistic lock on `workflowVersion`
- Admin routes use `requireAdmin()`
- Cron auth when `CRON_SECRET` set in production

---

## Status after WP0-A + WP0-B (2026-08-06)

See [WP0-A](../work-packages/WP0-A-security-multi-user-isolation.md), [WP0-B](../work-packages/WP0-B-security-completion.md), and [changelog.md](../changelog.md).

**Still open from Group A:** deploy/migration safety (WP1).
