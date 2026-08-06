# Post-WP2 Assessment — ContentWrite

> Ngày đánh giá: 2026-08-06  
> Phạm vi: kiểm tra tăng dần sau WP0-A, WP0-B, WP1, WP2; không audit lại repository từ đầu.  
> Baseline: [project-review.md](./project-review.md) — C+ trước WP0.  
> Trạng thái Git lúc bắt đầu: clean tại `a51aa63`; không có diff chưa commit.

## Kết luận điều hành

ContentWrite tăng từ **5.6/10 lên 7.0/10**. Phần tăng là thực chất: IDOR chính đã được đóng, authorization dùng user hiện tại từ DB, build không còn thay đổi database, migration có version, CI chạy được và build không cần database/Google Fonts.

Tuy nhiên dự án mới ở mức **MVP production tốt cho cá nhân / Beta cho nhóm nhỏ**, chưa phải production-ready cho 50–100 người hoặc nhiều workflow AI chạy đồng thời. Các giới hạn lớn nhất:

1. Trạng thái migration/backup của production chưa được xác minh từ môi trường đánh giá.
2. Series body đã được sanitize nhưng draft title/topic vẫn lộ qua Series GET; editor cũng có thể gắn bài của mình vào Series người khác.
3. Auto-write không tự hoàn tất qua Vercel Cron: mỗi cron chỉ chạy một step, sau đó đặt `nextRunAt +60s` nhưng cron hiện chỉ chạy mỗi ngày.
4. Test mới bao phủ helper; chưa có route/integration/workflow tests. CI lint cho phép warning budget và bỏ qua `scripts/**`.

Tổng hợp verification: **22 Verified Fixed · 6 Partially Fixed · 1 Not Fixed · 1 Cannot Verify · 0 Regression Found**. Hai Series gap là finding cũ chưa được đóng hết, không phải regression do WP2.

## Phương pháp và giới hạn

Đã đọc các work package, security/database/deployment/CI docs và source thay đổi WP0–WP2. Đã chạy:

| Command | Kết quả |
|---|---|
| `npm run test` | Pass — 4 files, 27 tests |
| `npm run typecheck` | Pass |
| `npm run lint:ci` | Pass — 0 errors, 11 warnings |
| `npm run db:validate` | Pass |
| `npm audit --omit=dev --audit-level=high` | Fail — 4 High advisories |
| `git status --short` / `git diff --stat` | Clean |
| `gh run list` | Không chạy được: `gh` chưa cài |

Không có quyền kết nối production database/Vercel dashboard, vì vậy không xác nhận migration history, backup, Preview env scope, CI remote mới nhất hoặc runtime smoke test production.

## 1. Xác minh WP0–WP2

Kết luận chỉ dùng: **Verified Fixed**, **Partially Fixed**, **Not Fixed**, **Regression Found**, **Cannot Verify**.

| Finding | Trạng thái trước | WP xử lý | Bằng chứng hiện tại | Kết luận |
|---|---|---|---|---|
| SEC-1 Digest IDOR | Editor CRUD digest người khác | WP0-A | List scope `ownedResourceWhere()` (`api/digests/route.ts:8-16`); GET/PATCH/DELETE kiểm `canAccessDigest()` và trả 404 (`api/digests/[id]/route.ts:8-68`); unit test (`access.test.ts:56-63`) | **Verified Fixed** |
| SEC-2 Series write IDOR | Editor sửa/xóa Series người khác | WP0-A | PATCH/DELETE kiểm `canAccessSeries()` (`api/series/[id]/route.ts:50-92`); null owner chỉ admin (`access.test.ts:61-62`) | **Verified Fixed** |
| Series draft / `cleanPublish` leak | Draft body/metadata lộ qua Series GET | WP0-A | Body được sanitize (`api/series/[id]/route.ts:15-42`; `access.test.ts:91-110`) nhưng row vẫn trả title/topic/status của draft người khác | **Partially Fixed** |
| Cross-user Series assignment | Editor có thể làm bẩn Series người khác | Không được WP0 bao phủ | Article PATCH chỉ xác nhận Series tồn tại, không `canAccessSeries()` (`api/articles/[id]/route.ts:59-77`) | **Not Fixed** |
| SEC-3 SSR stale JWT role | Dashboard tin role trong JWT | WP0-A/B | Dashboard dùng `requireUserOrRedirect()` (`dashboard/page.tsx:19`); `requireUser()` reload user từ DB (`auth.ts:104-120`) | **Verified Fixed** |
| SEC-6 inactive user | JWT còn hạn vẫn dùng API | WP0-B | `requireUser()` từ chối inactive/deleted (`auth.ts:104-113`); tests (`auth-session.test.ts:7-28`) | **Verified Fixed** |
| Session version invalidation | Role/password đổi nhưng token cũ còn hiệu lực | WP0-B | Token mới có `sv=user.updatedAt` (`auth.ts:45-56`); DB compare trong `requireUser`; legacy JWT thiếu `sv` vẫn được chấp nhận nếu active (`auth-session.test.ts:22-27`) | **Partially Fixed** |
| SEC-4 secret coupling | JWT secret fallback production = admin password | WP0-A | `auth-secret.ts` yêu cầu `SESSION_SECRET` khi production; fallback chỉ dev | **Verified Fixed** |
| SEC-13 password trong API JSON | Create/reset trả temporary password | WP0-B | `publicUser()` không có password; POST/PATCH trả public shape (`api/users/route.ts:6-24,73-84`; `api/users/[id]/route.ts:8-25,79-82`) | **Verified Fixed** |
| SEC-8 open redirect | `next` nhận URL ngoài | WP0-A | `safeInternalPath()` dùng ở login + middleware; malicious forms có test (`access.test.ts:120-130`) | **Verified Fixed** |
| SEC-5 integrations health public | Endpoint tốn quota public | WP0-A | Route gọi `requireAdmin()` trước ping (`api/health/integrations/route.ts:9`) | **Verified Fixed** |
| SEC-9 editorial memory cross-user | Editor thấy draft/knowledge người khác | WP0-A | API truyền owner scope (`api/editorial-memory/route.ts:22-30`); records lọc theo owned article và series draft lọc owner (`editorial-memory.ts:97-108,132-145`) | **Verified Fixed** |
| Login rate limit | Không throttle | WP0-A | Có 10 attempts/15m nhưng `Map` module-level per instance (`login-rate-limit.ts`) | **Partially Fixed** |
| Preview side-effect guard | Preview có thể gọi paid AI/auto-write | WP2 | Guard theo `VERCEL_ENV` (`deployment-env.ts:8-61`) và 4 tests; cron/auto-write/AI/image được chặn. CRUD/publish vẫn ghi DB nếu Preview dùng production URL (`preview-safety.md:44-51`) | **Partially Fixed** |
| TD-3 `db push` trong build | Build mutate DB | WP1 | `build = db:generate + next build`; `vercel-build = npm run build` (`package.json:7-10`) | **Verified Fixed** |
| Vercel build chạy migration | Production schema đổi khi compile | WP1/WP2 | Không có migrate/db push trong build path; migration scripts tách riêng (`package.json:18-32`) | **Verified Fixed** |
| Schema source of truth | Schema/manual SQL cạnh tranh | WP1 | `schema.prisma` được Prisma config/validate dùng; strategy quy định canonical. Legacy SQL vẫn còn | **Partially Fixed** |
| Baseline migration | Không có migration history | WP1 | Baseline có full schema và brownfield warning (`migrations/20260806100000_baseline/migration.sql:1-17`) | **Verified Fixed** |
| Incremental Series migration | `createdById` chỉ manual SQL | WP1 | Idempotent column/index/FK migration (`20260806100100_series_created_by_id/migration.sql:1-22`) | **Verified Fixed** |
| Production migration state | Không biết DB thực tế khớp schema | WP1 | Runbook/resolve flow có; không có live DB evidence | **Cannot Verify** |
| Legacy Series ownership | Có thể gán sai owner | WP1 | Column nullable; report dry-run, không update (`report-series-without-owner.mjs:1-12,45-81`) | **Verified Fixed** |
| Production migration intentional | Build tự migrate | WP1 | Chỉ operator script `deploy:migrate`; CI không gọi (`ci.yml:31-51`) | **Verified Fixed** |
| Test command fail đúng | Không test command | WP2 | `test = vitest run` (`package.json:15`); suite hiện pass 27 tests | **Verified Fixed** |
| Typecheck | Không standalone gate | WP2 | `tsc --noEmit`; local pass; CI step riêng (`ci.yml:37-38`) | **Verified Fixed** |
| Lint gate | Không lint CI | WP2 | Errors fail, nhưng `--max-warnings 20`, hiện 11 warnings; `scripts/**` ignored (`package.json:13`; `eslint.config.mjs:8-22`) | **Partially Fixed** |
| Prisma validate | Không gate schema syntax | WP2 | Script + CI step; local pass (`package.json:19`; `ci.yml:34-35`) | **Verified Fixed** |
| Build phụ thuộc Google Fonts | `next/font/google` fetch build-time | WP2 | Fontsource packages + CSS imports; không còn `next/font/google` | **Verified Fixed** |
| Build cần database | Prisma client khởi tạo lúc import | WP2 follow-up | Lazy proxy tạo client khi property được dùng (`lib/db.ts:19-38`); CI build không có env (`ci.yml:48-51`) | **Verified Fixed** |
| `npm run ci` coverage | Gate mô tả không chạy thật | WP2 | validate → typecheck → test → lint → build (`package.json:17`); local full gate pass trong phiên trước và từng gate pass ở assessment | **Verified Fixed** |
| GitHub Actions không prod DB/AI | CI có side effect | WP2 | Workflow chỉ install/gates; dummy localhost DB chỉ cho tests; không AI keys, migrate, deploy (`ci.yml:20-51`) | **Verified Fixed** |

## 2. Regression và finding mới

### Regression xác nhận

Không tìm thấy functional/security regression hiện hữu do WP0–WP2 trong các luồng được đọc. Build regression do Prisma khởi tạo eager đã được sửa ở `a51aa63` và build hiện có guard CI không-env.

### Finding mới / gap sau triển khai

| Severity | Module | Cách tái hiện | Tác động | Đề xuất |
|---|---|---|---|---|
| High | Production dependencies | `npm audit --omit=dev --audit-level=high` | 4 High advisories ở `fast-uri`, PostCSS, sharp/Next; exploitability runtime chưa xác nhận | Upgrade patch có kiểm soát, chạy full CI + smoke Vercel; không dùng `--force` mù |
| High (operational) | Auto-write cron | Bật auto-write, chờ cron `0 2 * * *` | `tickAutoWrite()` chạy đúng 1 step (`runner.ts:340-458`), hẹn +60s nhưng scheduler không gọi lại; một bài có thể mất nhiều ngày hoặc kẹt | Minimal WP3 hoặc đổi nhãn tính năng thành manual-run |
| Medium | Login bootstrap env | Gỡ `ADMIN_PASSWORD`, POST login với DB đã có user | `ensureBootstrapAdmin()` throw trước query user (`auth.ts:146-154`), login trả 500 (`login/route.ts:27-31`) dù docs nói “bootstrap only” | Chỉ yêu cầu password nếu DB trống, hoặc document là runtime-required |
| Medium | Series draft metadata | Editor B GET Series chứa draft của Editor A | Title/topic/status của draft cross-user lộ dù body null | Filter toàn row draft không accessible, không chỉ `cleanPublish` |
| Medium | Article → Series assignment | Editor PATCH bài của mình với `seriesId` thuộc Editor khác | Pollute thứ tự/nội dung Series người khác; có thể khuếch đại metadata leak | Check `canAccessSeries()` trước assign |
| Medium | CI lint | Thêm warning thứ 12–20 hoặc lỗi syntax trong `scripts/*.mjs` | CI vẫn pass; backfill/migration helper từng có syntax bug ngoài lint scope | Baseline warnings theo file hoặc `--max-warnings 0`; lint scripts |
| Medium | Test depth | Thay route wiring/Prisma query nhưng giữ helper tests pass | IDOR/session/preview route regression có thể lọt CI | Route integration tests với mocked DB + auth; workflow state-machine tests |
| Medium | Preview DB isolation | Cấu hình Preview bằng production `DATABASE_URL`, login và PATCH resource | CRUD/publish ghi production; WP2 chỉ chặn paid AI/auto-write | Neon Preview branch hoặc read-only credentials/mutation guard |
| Medium | Production migration/backup | Không có `db:migrate:status`, snapshot/restore evidence | Deploy có thể chạy code trước schema; rollback DB phụ thuộc backup chưa thử | Xác minh ngay và lưu operational evidence |
| Medium | Unsafe setup docs drift | `README.md:16`, `web/README.md:23,51`, `web/HUONG-DAN-CAU-HINH.md` vẫn hướng dẫn production `db push`; `architecture.md:191` mô tả build cũ | Operator có thể bypass migration history dù build đã an toàn | Thay bằng runbook/`migrate deploy`; giữ manual SQL chỉ historical |
| Low | CI/env docs drift | So sánh `environment-variables.md:49-52,97-101` và `WP2:63` với `ci.yml:48-51` | Docs nói CI dùng dummy secrets nhưng workflow hiện cố ý không env | Cập nhật docs vận hành |

## 3. Chấm điểm lại

Điểm trước WP0 được tái dựng từ baseline C+ và finding lúc đó; không phải benchmark runtime.

| Hạng mục | Trước WP0 | Hiện tại | Thay đổi | Lý do |
|---|---:|---:|---:|---|
| Giá trị sản phẩm | 7.5 | 7.7 | +0.2 | Pipeline/gates đã tồn tại; WP0–2 chủ yếu hardening |
| Kiến trúc | 6.2 | 6.8 | +0.6 | Modular monolith rõ hơn, access/auth/deploy concern tách |
| Chất lượng code | 5.2 | 6.2 | +1.0 | Helpers/testable guards; vẫn god file và dual state |
| Maintainability | 4.7 | 5.6 | +0.9 | Docs/CI tốt hơn; workflow ~2.9k dòng, parser/retry phân tán |
| Security | 4.5 | 7.8 | +3.3 | IDOR, secret, session, admin health được xử lý; CVE/rate limit residual |
| Multi-user isolation | 3.0 | 7.2 | +4.2 | CRUD ownership tốt; Series read metadata/assignment gap và Preview DB còn |
| Database safety | 3.2 | 6.8 | +3.6 | Versioned migrations/runbook; production history chưa verify |
| Deployment safety | 3.5 | 7.3 | +3.8 | Build không mutate DB; operator migration/rollback rõ |
| Vercel compatibility | 4.8 | 7.0 | +2.2 | Offline build, lazy DB, Preview guards; long jobs chưa phù hợp |
| Testing | 1.5 | 4.3 | +2.8 | 27 helper tests nhưng không route/workflow/integration |
| CI quality gate | 0.5 | 6.8 | +6.3 | Full gate có thật; lint warning budget/scripts gap |
| Reliability | 4.8 | 5.2 | +0.4 | State transition tốt; auto-write/timeout recovery yếu |
| Performance | 5.0 | 5.0 | 0.0 | Chưa đo/chưa xử lý hot paths |
| Observability | 2.2 | 2.7 | +0.5 | Có transition audit + lastError, chưa error tracking/metrics/alerts |
| Scalability | 3.8 | 4.8 | +1.0 | Isolation tốt hơn; serverless state/concurrency/AI jobs chưa chứng minh |
| Production readiness | 4.8 | 6.8 | +2.0 | An toàn hơn rõ rệt nhưng thiếu live DB/backup/monitoring evidence |

**Overall có trọng số: 5.6 → 7.0/10.** Security/deploy tăng mạnh; reliability/observability/testing kéo điểm xuống.

## 4. Production readiness

**Mức hiện tại:** **MVP production** cho cá nhân; **Beta** cho nhóm nhỏ. Chưa production-ready cho multi-user quy mô vừa.

| Khía cạnh | Đánh giá |
|---|---|
| Dữ liệu | Prisma + optimistic workflow transition tốt; production migration/backup chưa verify |
| Security | Ownership và DB-backed authZ tốt hơn; dependency High CVEs, rate limit per-instance |
| Deploy/Rollback | App rollback rõ; DB rollback dựa snapshot, chưa drill |
| Session | Current JWT tốt; legacy token thiếu `sv` là residual 7 ngày |
| Multi-user | Cô lập core resources đủ cho pilot nhỏ; chưa có route integration proof |
| AI quota | Preview paid calls blocked; production concurrency/budget chưa có guard tổng |
| Long-running workflow | Một request có thể tới 300s; client loop và timeout vẫn là rủi ro |
| Cron | Không hoàn tất auto-write tự động với daily single-step cron |
| Error recovery | Có workflow state/transition và resume theo article; chưa có dead-letter/alert/manual ops UI rõ |
| Monitoring | Thiếu error tracking, latency/failure metrics và alert |
| Backup/incident | Runbook có nhưng chưa có bằng chứng snapshot restore/incident drill |

### Theo quy mô

1. **Dùng cá nhân:** phù hợp ở mức MVP production nếu migration/env/backup được xác nhận và chấp nhận auto-write manual.
2. **5–20 người:** Beta có kiểm soát; cần đóng Series metadata/assignment gap, Preview DB riêng, route integration tests, monitoring tối thiểu và xử lý dependency advisories.
3. **50–100 người:** chưa đủ an toàn; chưa benchmark DB/API, thiếu distributed abuse controls, observability và operational capacity.
4. **Nhiều người chạy AI đồng thời:** chưa sẵn sàng; request dài, quota/concurrency không điều phối, không queue/job lease.

## 5. Giá trị sản phẩm

### Giá trị được code chứng minh

- Workflow AI-TFES có state machine, optimistic version, immutable artifact revisions và append-only transitions (`schema.prisma:110-183`; `state-machine.ts:173-239`).
- Human review, fact verdict, approval, publish, correction/retraction là các hành động rõ trong API (`actions/route.ts:31-122`).
- Editorial memory và series giúp tránh trùng góc; quality gates có thể dừng/revise thay vì luôn sinh text.
- Clean publish, export Markdown, image workflow và audit trail tạo “editorial workbench”, không chỉ chat.

### Giá trị còn là giả định

- Nhiều gate/step tạo bài tốt hơn ChatGPT/Claude về chất lượng cuối.
- Audit trail được editor sử dụng thay vì chỉ tăng complexity.
- Auto-write tạo giá trị đủ lớn để biện minh cho reliability work.

### Cần người dùng thật xác nhận

- Time-to-first-draft, time-to-publish, tỷ lệ hoàn tất workflow, số lần retry/manual intervention.
- Chất lượng do editor chấm và chênh lệch so với dùng chatbot trực tiếp.
- Cost/article, tỷ lệ bài bị bỏ, retention editor tuần 1/4.
- Thời gian học workflow và bước nào gây nhầm/kẹt.

**Lợi thế khác biệt tiềm năng:** quy trình biên tập có bằng chứng, state/audit và human gates. **Rủi ro over-complexity:** nếu chất lượng/throughput không vượt chatbot + checklist thủ công, 20+ state và nhiều gate là chi phí hơn là moat.

## 6–10

Danh sách P0–P3: [remaining-risks.md](./remaining-risks.md).  
Ba phương án, WP3, Top 10 và khuyến nghị: [next-step-recommendation.md](../next-step-recommendation.md).  
Health summary: [project-health.md](../project-health.md).

## Trả lời thẳng

1. **Điểm tổng thể:** 7.0/10.
2. **Điểm tăng có thực chất:** Có — đặc biệt security, isolation, DB/build/CI.
3. **Đã sẵn sàng nhiều user:** Pilot 5–20 có kiểm soát; chưa cho 50–100/concurrent AI.
4. **Rủi ro lớn nhất:** production operations chưa được chứng minh và auto-write scheduler không thể tự resume đúng nhịp.
5. **Giá trị lớn nhất:** workflow biên tập có state, evidence, human gates và audit trail.
6. **WP3 hay feature:** làm một lát cắt reliability/measurement nhỏ, không full worker rewrite; sau đó ưu tiên product feedback.
7. **Over-engineering:** số state/gate có nguy cơ quá mức nếu chưa có dữ liệu chất lượng.
8. **Thiếu đầu tư:** observability, integration tests, production verification và onboarding metrics.
9. **Modular monolith:** nên tiếp tục.
10. **Nếu chỉ làm một việc:** xác minh production DB/backup và thêm đo lường workflow completion/failure; dữ liệu đó quyết định đúng phạm vi WP3.
