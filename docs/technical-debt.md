# Technical Debt Register

> Cập nhật: 2026-08-06. Trạng thái đồng bộ với [roadmap.md](./roadmap.md).

---

## Critical

| ID | Mô tả | File | WP | Trạng thái |
|----|-------|------|-----|------------|
| TD-1 | God file `workflow.ts` (~2.869 dòng) | `web/src/lib/tfes/workflow.ts` | WP5 | Open |
| TD-2 | Không automated test / CI | `web/package.json`, `.github/workflows/ci.yml` | WP2 | **Partial** — CI có thật; test hiện 8 files/60 tests, route/E2E vẫn thiếu |
| TD-3 | `prisma db push` trong build | `web/package.json` | WP1 | **Resolved** — build = generate + next build |
| TD-4 | Schema drift (manual SQL) | `web/prisma/sql/`, `migrations/manual_*` | WP1 | **Partial** — versioned migrations + inventory; legacy SQL retained |

---

## High

| ID | Mô tả | WP | Trạng thái |
|----|-------|-----|------------|
| TD-5 | Vercel timeout vs auto-write cron gap | WP3 | Open |
| TD-6 | Circular import workflow ↔ runner | WP5 | Open |
| TD-7 | Dual state (workflowState + markers + legacy) | WP5 | Open |
| TD-8 | Dual storage Article columns + WorkflowArtifact | WP4/WP5 | Open |
| PERF-2 | N+1 / full scans hot path | WP4 | Open |
| PERF-3 | Missing indexes | WP4 | Open |
| PERF-4 | Large SSR/API payloads | WP4 | Open |

---

## Medium

| ID | Mô tả | WP | Trạng thái |
|----|-------|-----|------------|
| TD-9 | Secondary god files (quality, prompts, runner) | WP5 | Open |
| TD-10 | Scattered retry config | WP5 | Open |
| TD-11 | Duplicated parser helpers | WP5 | Open |
| TD-12 | Inconsistent error handling | WP5 | Open |
| TD-13 | Dead code (AutoWriteWatcher, runFullWorkflowToReview) | WP3 | Open |
| TD-14 | No standalone typecheck in CI | WP2 | **Resolved** — `npm run ci` |
| TD-15 | HTTP client dev/prod divergence | WP3 | Open |
| SMELL-3 | UI/server orchestration duplicate | WP5 | Open |
| TD-16 | Lint gate cho phép 20 warnings, bỏ qua `scripts/**` | WP2 follow-up | Open |
| TD-17 | Không route/workflow integration tests | Quality follow-up | Open |
| OPS-1 | Production migration/backup/restore chưa có evidence | Production assurance | Open |
| OPS-2 | Preview có thể ghi production DB nếu dùng chung URL | Production assurance | Open |
| SEC-DEP-1 | `npm audit` có 4 High advisories | Dependency update | Open |
| OBS-1 | Thiếu error tracking/metrics/alerts | Production assurance | Open |
| AUTO-1 | Daily cron chỉ tiến một step, không honor retry +45/+60s | WP3-min | Open |
| ENV-1 | Login cần `ADMIN_PASSWORD` mỗi request nhưng docs nói bootstrap-only | Env follow-up | Open |
| DOC-1 | README/setup/architecture vẫn hướng dẫn production `db push`; CI env docs stale | Docs follow-up | Open |
| SEC-10 | Series GET lộ draft title/topic; Article có thể gắn vào Series người khác | WP0 follow-up | Open |
| REL-1 | Editorial Review, pre-9b và 9b dùng chung remediation budget | WP2.7 candidate | **Deferred** — F7 ngoài phạm vi WP2.6 |
| REL-2 | Sau remediation, Human Review không mở lại; `draft12` không có đường sửa tay | WP2.7 candidate | **Deferred** — F8/manual editing ngoài phạm vi WP2.6 |

---

## WP2 outcomes

| ID | Resolution |
|----|------------|
| TD-2 | GitHub Actions CI exists; route/workflow coverage remains open (TD-17) |
| TD-14 | CI runs typecheck |
| BUILD-1 | Offline fonts via `@fontsource/*` — no Google fetch at build |
| VERCEL-1 | Preview blocks AI/auto-write/cron side effects; CRUD isolation remains partial |

### WP2.6 outcomes

| ID | Resolution |
|----|------------|
| REV-CTX-9B | Final Verification dùng context policy 16k–32k theo target, không còn clip 7k |
| REV-TOKEN-FACT | Fact remediation dùng `cleanGenMaxTokens`, không còn hard-code 5.200 |
| PARSER-P1 | Exact machine-line parser; malformed output không quét enum toàn văn, không PASS/REWRITE oan |
| PARSER-P2 | Canonical Editorial contract `PROVISIONAL_*`; legacy `FINAL_*` được phân biệt; template không trộn key |
| PARSER-P3/P4 | Shared checklist parser cho machine gate và Human Review; bảng/header/separator/PASS được xử lý nhất quán |

---

## Resolved (WP1)

| ID | Resolution |
|----|------------|
| TD-3 | Removed `prisma db push` from build/vercel-build; separate `db:migrate:*` scripts |
| TD-4 | Baseline + incremental migrations; [schema-artifact-inventory.md](./database/schema-artifact-inventory.md) |

---

## Resolved (WP0-B)

| ID | Resolution |
|----|------------|
| SEC-6 | Session `sv` stamp + `isSessionInvalidated`; SSR guards; middleware rejects `active:false` |
| SEC-13 | No password in users API JSON; admin UI one-time display |
| SMELL-5 | `article-tabs.ts`; final verify → `knowledge` tab |

---

## Resolved (WP0-A)

| ID | Resolution |
|----|------------|
| SEC-1..2 | Digest/Series ownership checks |
| SEC-3 | Dashboard uses `requireUser()` |
| SEC-4 | `auth-secret.ts` — SESSION_SECRET required in production |
| SEC-7,8,5,9 | Rate limit, safe redirect, admin health, editorial scope |

---

## Chấp nhận tạm thời (Group C)

- Bcrypt cost 10 — chấp nhận đến future hardening WP
- CSRF SameSite-only — chấp nhận cho app nội bộ
- Client-only pages without SSR guard — inactive user sees shell; API 401
- Middleware JWT gate without DB — API/SSR enforce inactive

---

## Giả định cần xác nhận

- Legacy Series/Digest với `createdById = null` chỉ admin sửa — **đã implement**; cần admin gán owner nếu muốn editor quản lý legacy rows
- Editorial memory shared published titles — **editor scope: own published + own knowledge** (WP0-A); admin giữ domain-wide
- Production `_prisma_migrations`, Series column và backup restore — **chưa xác nhận**
- Vercel Preview có `DATABASE_URL` riêng — **chưa xác nhận**
- Auto-write có đủ user value để đầu tư full WP3 — **chưa có usage data**

---

## Post-WP2 assessment

- Overall: **7.0/10**
- Readiness: MVP production cá nhân / controlled Beta 5–20 users
- Chi tiết: [audit/post-wp2-assessment.md](./audit/post-wp2-assessment.md)
- Rủi ro còn lại: [audit/remaining-risks.md](./audit/remaining-risks.md)
