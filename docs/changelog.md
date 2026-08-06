# Changelog

## 2026-08-06 — WP2: Quality Gate & Vercel Compatibility

### Added

- GitHub Actions CI (`.github/workflows/ci.yml`) — validate, typecheck, test, lint, build
- `web/src/lib/deployment-env.ts` — Preview side-effect guards + tests
- Offline fonts: `@fontsource/be-vietnam-pro`, `@fontsource/source-serif-4`, `@fontsource-variable/jetbrains-mono`
- Docs: `vercel-production.md`, `environment-variables.md`, `preview-safety.md`, WP2 work package
- Scripts: `npm run ci`, `lint:ci`; `web/.nvmrc` (Node 20)

### Changed

- `vercel-build` delegates to `npm run build` (single source)
- Preview deployment blocks cron, auto-write, NVIDIA, Tavily, hero gen by default
- ESLint: `scripts/` ignored; `react-hooks/set-state-in-effect` → warn (baseline)

### Vercel / build

- Build does not call `db push`, `migrate deploy`, or paid APIs
- Build does not fetch Google Fonts (bundled fontsource)
- Prisma generate only — no DATABASE_URL required to compile
- Prisma client instantiated lazily so page-data collection works without a database

### Not changed

- Auto-write resume / cron timeout handling (WP3)
- Distributed rate limit (accept in-memory per instance)
- Full Preview read-only DB mode (documented risk if shared production DATABASE_URL)

---

## 2026-08-06 — WP1: Database & Deployment Safety

### Added

- Versioned Prisma migrations: `20260806100000_baseline`, `20260806100100_series_created_by_id`
- `migration_lock.toml`
- Scripts: `db:generate`, `db:validate`, `db:migrate:deploy`, `db:migrate:status`, `deploy:precheck`, `deploy:migrate`, `deploy:build`
- `scripts/report-series-without-owner.mjs` — dry-run legacy Series report
- Docs: WP1 work package, migration strategy, schema inventory, deploy runbook

### Changed

- `npm run build` / `vercel-build`: **no longer** runs `prisma db push` (generate + next build only)
- `db:push` deprecated with console warning
- Single source of truth: `web/prisma/schema.prisma`

### Deployment notes (manual — required before first WP1 deploy on brownfield)

1. Backup database
2. `npm run db:migrate:resolve -- --applied 20260806100000_baseline` (existing DBs)
3. `npm run deploy:migrate` or resolve incremental if already applied
4. `npm run db:migrate:status` to verify
5. Run `npm run db:report:series-owners` optional — assign Series owners manually

### Not changed

- Application business logic / auth (WP0)
- CI pipeline (WP2)
- Production DB not verified by agent in WP1

---

## 2026-08-06 — WP0-B: Security Completion

### Added

- `lib/auth-session.ts` — `isSessionInvalidated`, `isJwtMarkedInactive`
- `lib/auth-guard.ts` — `requireUserOrRedirect()` for SSR
- `lib/article-tabs.ts` — type-safe tab keys
- Tests: `auth-session.test.ts`, `article-tabs.test.ts`

### Changed

- JWT includes `active: true` and `sv` (session version) at login
- `requireUser()` invalidates sessions after user record changes (deactivate, role, password reset)
- Middleware rejects JWT with `active: false`
- SSR guards: home, dashboard, library (+ article detail)
- Users API: no `temporaryPassword` in JSON responses
- Admin users panel: one-time password from form/client only
- Article detail: final verification failure → `knowledge` tab (not invalid `review`)

### Database / env

- No schema changes
- No new env vars

---

## 2026-08-06 — WP0-A: Security & Multi-user Isolation

### Added

- Central ownership helpers in `lib/access.ts` (Digest, Series, article body visibility)
- `lib/auth-secret.ts` — production requires `SESSION_SECRET`
- `lib/safe-redirect.ts`, `lib/login-rate-limit.ts`
- Vitest + `lib/access.test.ts`
- `Series.createdById` in Prisma schema + manual SQL patch
- Documentation: audit, roadmap, technical debt, access model, work packages

### Changed

- Digest API: scoped list + 404 on unauthorized access
- Series API: ownership on write; sanitize `cleanPublish` on read
- Dashboard SSR: `requireUser()` instead of JWT-only `getSession()`
- Editorial memory: editor-scoped angles; workflow passes creator scope
- Login: rate limit; generic bootstrap error
- `/api/health/integrations`: admin-only (removed from public middleware paths)
- Login form: safe post-login redirect

### Deployment notes

1. Set `SESSION_SECRET` in production (distinct from `ADMIN_PASSWORD`)
2. ~~Run manual series SQL~~ — superseded by WP1 migration `20260806100100_series_created_by_id`
3. Run `npx prisma generate` after schema pull

### Not changed

- Workflow pipeline behavior (except editorial memory input scope)
- No CI yet (WP2)
