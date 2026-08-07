# Changelog

## 2026-08-07 — Editorial Format Reliability (WP-PV2-02)

Production blocker: một Editorial Review sai định dạng bị xử lý như bài chất lượng 0,
đẩy bài sang REWRITE_REQUIRED và đốt hết revision budget (`89 → 0 → REWRITE → exhausted`).

### Fixed

- Malformed Editorial output không còn tạo score 0, verdict REWRITE/MINOR, hay gate fail giả
- Format defect đi theo retry riêng (`editorial-review-format-invalid`) và không tiêu
  revision remediation budget
- Hết lượt format retry thì pause Human Review, giữ nguyên draft và best candidate
- `totalScore: 0` từ template placeholder được coi là malformed thay vì REWRITE thật
- Marked v2 block được ưu tiên hơn canonical line xuất hiện trong prose
- Editorial v2 `maxTokens` 2200 → 3200 (JSON typed bị cắt là nguyên nhân truncation)

### Added

- `machine-contract.ts`: normalization layer (last valid block, fence, trailing comma,
  newline thô trong string, numeric string, enum/gate alias, phát hiện truncation)
- `buildEditorialFormatRepairPromptV2`: prompt chỉ sửa định dạng, cấm chấm lại
- Telemetry: `parserVersion`, `malformedReasonCode`, `rawOutputLength`, `outputTruncated`,
  `formatRetryCount`, `formatRetrySucceeded`, `revisionBudgetConsumed`
- Metrics `editorialFormat`: malformed rate, retry success/exhaustion rate, human pause,
  false content-failure prevented — legacy row không bị suy diễn thành 0
- 27 test contract/parser/retry + trajectory regression `64 → 89 → malformed`

### Docs

- `docs/debug/editorial-v2-parser-production-failure.md`
- `docs/work-packages/WP-PV2-02-editorial-format-reliability.md`
- `docs/validation/remediation-metrics.md` — nhóm metric Editorial format

---

## 2026-08-07 — AI-TFES v2 RC2 Production Validation prep

### Fixed

- Lock-v2 final telemetry carries prior editorial score for cohort score comparisons
- `CONTEXT_INCOMPLETE` retries/blocks instead of opening a MINOR remediation loop
- Bootstrap `ADMIN_PASSWORD` is trimmed before hash (env whitespace mismatch)

### Docs

- `docs/releases/AI-TFES-v2-RC2-validation.md` — rollout, cohorts, KPIs, rollback, scorecard

---

## 2026-08-07 — AI-TFES v2 RC2 Prompt Trio (WP-PV2-01)

### Added

- Minimal versioned Prompt Registry with v1.6 fallback
- Typed DIAGNOSE-only `editorial-diagnosis@2.0`
- MINIMUM EDIT `minor-remediation@2.0` with full-draft compatibility
- Evidence/action-focused `lock-verifier@2.0`
- Prompt version, machine contract, context character, token estimate, defect, and Lock telemetry
- Prompt-context comparison metrics and no-live-AI contract/integration tests

### Safety

- `promptArchitecture.enabled` defaults OFF
- Existing v1.6 prompts and parsers remain available
- Unknown versions and malformed v2 outputs fail safe
- No Section Patch Engine, additional prompt migration, model/threshold/retry/state change,
  schema, migration, or environment change

---

## 2026-08-07 — AI-TFES v2 RC1 (WP-V2-03–05)

### Added

- Deterministic craft-only False Final MINOR Guard
- MINOR-only preservation prompt and optional section-change metadata
- Regression Auto-ack Brake using the existing Human Review path
- Centralized independently rollbackable RC1 flags and `aiTfesVersion` exposure
- Guard/brake/revision/manual-recovery metrics and version-filtered cohort report
- RC1 unit, compatibility, wiring, and production-failure trajectory tests

### Safety

- All behavior flags default OFF
- Unknown Final residuals and malformed review scores fail safe
- No model, threshold, retry, state-machine, schema, migration, or environment change
- No Section Patch, Final Delta, Typed Defects, split budgets, or multi-agent implementation

---

## 2026-08-07 — WP-V2-02: Best Candidate Lock

### Added

- Deterministic, cycle-scoped best-candidate controller with configurable epsilon
- Immutable best-draft promotion revisions while preserving rejected candidates for audit
- Exhaustion retention and missing-artifact preflight protection
- Lock-aware convergence telemetry and bounded cohort metrics
- Unit, trajectory, wiring, and metrics tests without live AI/production DB calls

### Safety

- Feature defaults OFF in `PIPELINE_CONFIG.aiTfesV2.bestCandidateLock`
- OFF preserves current accept-always behavior
- Rejected candidates still consume the existing remediation attempt
- Restoring best invalidates Fact Check and downstream publish outputs
- No prompt, model, threshold, retry, state-machine, Prisma schema, migration, or env change

---

## 2026-08-07 — WP2.7: Production Validation & Measurement

### Added

- Admin-only deployment SHA diagnostics with Vercel/Git fallback and `unknown`
- Versioned remediation telemetry in `WorkflowTransition.details`
- Article-scoped remediation timeline with score/gate/retry/runtime classification
- Optimistic manual `draft12` recovery with immutable artifact revision
- Private five-question editor feedback in `deskJson`
- Read-only JSON/CSV/Markdown cohort metrics report
- Production validation, metrics, version-verification and feedback protocols

### Safety

- No workflow refactor, queue, worker, microservice or WP-E0A implementation
- Manual recovery preserves remediation counters and reruns Editorial Review
- No Prisma schema/migration or required env change
- Telemetry excludes prompts, article body and secrets
- Automated tests do not call AI; production cohort remains manual/admin-triggered

### Validation status

- Technical implementation complete pending all automated quality gates
- WP2.5/WP2.6 remain unvalidated until Cohorts A/B/C satisfy the protocol
- WP-E0A remains **DO AFTER PRODUCT VALIDATION**

---

## 2026-08-06 — WP2.6: Final Gate & Parser Reliability

### Fixed

- Final Verification 9b đọc draft bằng policy context chung 16k–32k theo `targetWordCount`, không còn clip 7k
- Fact remediation dùng `cleanGenMaxTokens()` cho output toàn bộ draft, không còn hard-code 5.200
- Editorial Review parser chỉ đọc exact machine lines; enum trong template/giải thích không còn gây REWRITE oan
- Markdown table checklist được machine gate và Human Review parse bằng cùng helper
- Header/separator/PASS row không còn trở thành finding Human Review

### Changed

- Canonical Editorial machine contract: `PROVISIONAL_TOTAL_SCORE`, `PROVISIONAL_INSIGHT_SCORE`,
  `GATES_G1_G8`, `EDITORIAL_DECISION`
- Legacy `FINAL_*` Editorial output vẫn được đọc như một contract riêng; không trộn canonical/legacy
- `Review.md` không khai báo lại machine keys; prompt của mỗi phase là nguồn contract

### Verification

- 8 test files / 60 tests pass, gồm parser, prompt contract và source-level workflow wiring
- Không đổi model, temperature, quality threshold, retry policy, state machine, DB hoặc auto-write
- Cần validation trên bài production thật; không gọi AI trong test/build

### Deferred

- F7: tách remediation budget
- F8: mở lại Human Review/reset counter
- Manual editing cho `draft12`

---

## 2026-08-06 — WP2.5: Revision Context & Token Reliability

### Fixed

- Editorial Review nhận Research Brief và full draft theo context policy 16k–32k
- Revision remediation dùng `cleanGenMaxTokens()` thay hard-code 5.600
- Required Revisions mới nhất được đưa lên đầu prompt remediation, không còn mất do prefix clipping

---

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
