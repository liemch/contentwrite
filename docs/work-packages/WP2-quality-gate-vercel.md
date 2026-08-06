# WP2 — Quality Gate & Vercel Production Compatibility

> Trạng thái: **Done** (2026-08-06)  
> Phụ thuộc: WP0-A (tests), WP1 (safe build)

---

## Mục tiêu

| # | Mục tiêu | Trạng thái |
|---|----------|------------|
| 1 | CI quality gate (no deploy/migrate/AI) | **Done** — `.github/workflows/ci.yml` |
| 2 | Vercel build không mutate DB | **Done** (WP1) — verified |
| 3 | Build không phụ thuộc Google Fonts network | **Done** — `@fontsource/*` |
| 4 | `build` = `vercel-build` | **Done** |
| 5 | Preview side-effect guards | **Done** — `deployment-env.ts` |
| 6 | Env var documentation (3 tiers) | **Done** |
| 7 | Vercel incompatibility register | **Done** — vercel-production.md |
| 8 | Không sửa WP3 runtime (auto-write resume) | **Done** — documented only |

---

## Thay đổi code

| File | Thay đổi |
|------|----------|
| `web/src/app/layout.tsx` | Fontsource thay `next/font/google` |
| `web/src/app/globals.css` | Font CSS variables |
| `web/src/lib/db.ts` | Lazy Prisma client — build không cần `DATABASE_URL` |
| `web/src/lib/deployment-env.ts` | Preview tier + guards |
| `web/src/lib/deployment-env.test.ts` | 4 tests |
| `web/src/app/api/cron/auto-write/route.ts` | Preview block |
| `web/src/app/api/auto-write/*/route.ts` | Preview block |
| `web/src/lib/nvidia.ts`, `search.ts`, `image/hero.ts` | Preview side-effect assert |
| `web/package.json` | `ci`, `lint:ci`, `vercel-build`, `engines` |
| `web/eslint.config.mjs` | warn set-state-in-effect; ignore `scripts/` |
| `.github/workflows/ci.yml` | Quality gate workflow |
| `web/scripts/report-series-without-owner.mjs` | Fix syntax (lint) |
| `web/src/app/api/articles/[id]/hero/route.ts` | prefer-const fix |

---

## Scripts

```json
"build": "npm run db:generate && next build",
"vercel-build": "npm run build",
"ci": "npm run db:validate && npm run typecheck && npm run test && npm run lint:ci && npm run build",
"lint:ci": "eslint . --max-warnings 20"
```

---

## GitHub Actions

Workflow `CI` on push/PR to main:

1. `npm ci` in `web/`
2. `db:validate`
3. `typecheck`
4. `test` (dummy DATABASE_URL)
5. `lint:ci`
6. `build` (dummy SESSION_SECRET — no external network for fonts)

**Không:** deploy, migrate, production DB, AI APIs.

---

## Rollback

- Revert PR — CI và Vercel build trở lại trạng thái trước
- Preview guards: remove `deployment-env` checks nếu cần emergency (không khuyến nghị)
- Fonts: revert layout to google fonts (sẽ phụ thuộc network lúc build)

---

## Kiểm thử

| Command | Expected |
|---------|----------|
| `npm run test` | Pass (27 tests incl. deployment-env) |
| `npm run typecheck` | Pass |
| `npm run lint:ci` | Pass (warnings baseline) |
| `npm run build` | Pass offline |
| `npm run ci` | Full gate pass |

---

## WP tiếp theo

**WP3 — Auto-write Reliability:** cron alignment, timeout/resume, distributed concerns.

---

## Liên kết

- [vercel-production.md](../deployment/vercel-production.md)
- [environment-variables.md](../deployment/environment-variables.md)
- [preview-safety.md](../deployment/preview-safety.md)
