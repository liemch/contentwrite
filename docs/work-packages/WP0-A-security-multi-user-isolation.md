# WP0-A — Security & Multi-user Isolation (Phase A)

| Field | Value |
|-------|-------|
| **Status** | Done (2026-08-06) |
| **Complexity** | M |
| **Prerequisite** | None |

---

## Mục tiêu

Cô lập dữ liệu giữa editor; đồng bộ authorization SSR/API; vá IDOR và secret coupling — **không** refactor workflow.

---

## Phạm vi

- Central ownership helpers (`access.ts`)
- Digest + Series API authorization
- Series `createdById` schema + manual SQL
- Dashboard SSR `requireUser()`
- SESSION_SECRET separation (production)
- Editorial memory scoping (editor vs admin)
- Login rate limit + open redirect fix
- Admin-only integrations health
- Vitest + `access.test.ts`
- Documentation

---

## Ngoài phạm vi

- WP1 migrations / remove db push
- Workflow refactor
- CI pipeline
- Middleware DB check (WP0-B)
- Tab `"review"` bug fix
- Temp password API response

---

## Findings addressed

| ID | Status |
|----|--------|
| SEC-1 IDOR Digests | Done |
| SEC-2 IDOR Series + cleanPublish | Done |
| SEC-3 Dashboard stale JWT | Done |
| SEC-4 SESSION_SECRET fallback | Done (production) |
| SEC-5 Public health integrations | Done |
| SEC-7 Login rate limit | Done (partial — in-process) |
| SEC-8 Open redirect | Done |
| SEC-9 Editorial memory scope | Done |
| TD-2 Tests | Partial — access tests only |

---

## Files changed

### New

- `web/src/lib/auth-secret.ts`
- `web/src/lib/safe-redirect.ts`
- `web/src/lib/login-rate-limit.ts`
- `web/src/lib/access.test.ts`
- `web/vitest.config.ts`
- `web/prisma/sql/20260806_series_created_by.sql`
- `docs/audit/project-review.md`
- `docs/roadmap.md`
- `docs/technical-debt.md`
- `docs/security/multi-user-access-model.md`
- `docs/work-packages/*`
- `docs/changelog.md`

### Modified

- `web/src/lib/access.ts`
- `web/src/lib/auth.ts`
- `web/src/middleware.ts`
- `web/prisma/schema.prisma`
- `web/src/app/api/digests/route.ts`
- `web/src/app/api/digests/[id]/route.ts`
- `web/src/app/api/series/route.ts`
- `web/src/app/api/series/[id]/route.ts`
- `web/src/app/api/editorial-memory/route.ts`
- `web/src/app/api/auth/login/route.ts`
- `web/src/app/api/health/integrations/route.ts`
- `web/src/app/dashboard/page.tsx`
- `web/src/app/login/login-form.tsx`
- `web/src/lib/tfes/editorial-memory.ts`
- `web/src/lib/tfes/workflow.ts` (getEditorialMemory scope only)
- `web/package.json`
- `web/.env.example`

---

## Database impact

**Schema change:** `Series.createdById` (optional FK → User).

**Manual migration required:**

```bash
# On each environment (staging/prod) — NOT run automatically
psql $DATABASE_URL -f web/prisma/sql/20260806_series_created_by.sql
npx prisma generate
```

Existing series rows keep `createdById = null` → **admin-only** PATCH/DELETE.

---

## Environment variables

| Variable | Change |
|----------|--------|
| `SESSION_SECRET` | **Required in production** (must differ from `ADMIN_PASSWORD`) |

---

## Security impact

- Positive: IDOR closed on Digest/Series; draft cleanPublish hidden; SSR uses DB role
- Residual: middleware JWT-only; rate limit per-instance

---

## Regression risk

| Area | Risk | Mitigation |
|------|------|------------|
| Legacy series edit | Editors lose edit on null-owner series | Admin assigns or recreates series |
| Editorial memory | Editors see fewer dedupe hints | Intended; admin retains full view |
| Health check | Settings UI calling integrations unauthenticated | Must use admin session |

---

## Acceptance criteria

- [x] Editor cannot GET/PATCH/DELETE another user's digest (404)
- [x] Editor cannot PATCH/DELETE series they don't own (404)
- [x] Editor cannot see other's draft cleanPublish in series GET
- [x] Dashboard uses DB-backed `requireUser()`
- [x] Production rejects missing SESSION_SECRET
- [x] Open redirect blocked
- [x] Login rate limit returns 429
- [x] `/api/health/integrations` requires admin
- [x] `access.test.ts` covers ownership rules

---

## Rollback

1. Revert git commit for WP0-A
2. DB: `ALTER TABLE "Series" DROP COLUMN IF EXISTS "createdById";` (only if no data dependency)
3. Restore `SESSION_SECRET` fallback if needed temporarily in dev

---

## Verification (local)

```bash
cd web
npm install
npm run test
npm run typecheck
npm run lint
npm run build   # requires DATABASE_URL; does not require applying Series SQL for compile
```

Apply SQL before testing Series ownership against real DB.

---

## Next WP

**WP0-B** — middleware inactive user, tab bug, temp password, bcrypt — or **WP1** if deploy safety is higher priority.
