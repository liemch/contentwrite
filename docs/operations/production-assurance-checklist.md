# Production Assurance Checklist

Checklist vận hành trước/sau deploy production. Dùng cùng [production-version-verification.md](./production-version-verification.md).

## Database & migrations

- [ ] `npm run deploy:precheck` pass trên CI hoặc local với `DATABASE_URL` staging
- [ ] `npm run deploy:migrate` đã chạy trên production (không dùng `db:push`)
- [ ] Backup Neon/Postgres gần nhất (< 24h) và đã thử restore trên staging (OPS-1 evidence)

## Preview vs Production isolation

- [ ] Preview Vercel dùng **DATABASE_URL riêng** — không trỏ production (OPS-2)
- [ ] Không set `ALLOW_PREVIEW_SIDE_EFFECTS=1` trên Production
- [ ] Smoke test Preview: login, dashboard, tạo bài — side effects AI/auto-write bị chặn

## Auth & multi-user

- [ ] Admin seed: `npm run db:seed-admin` (hoặc user ADMIN có sẵn)
- [ ] Editor login bằng **email + password** (không chỉ `ADMIN_PASSWORD`)
- [ ] `SESSION_SECRET` ≥ 32 ký tự, khác `ADMIN_PASSWORD`

## Observability

- [ ] (Tuỳ chọn) `SENTRY_DSN` trên Vercel Production
- [ ] Dashboard admin hiển thị cảnh báo bài stale >30 phút khi pipeline treo
- [ ] Kiểm tra Tavily + NVIDIA từ Settings → Test integrations

## Quality cohort (WP2.7)

- [ ] Manifest cohort lưu tại Settings → WP2.7 Cohort Tracker
- [ ] Chạy `npm run db:report:remediation -- --manifest <file>` khi kết thúc cohort
- [ ] Không tune prompt/threshold trong lúc cohort đang frozen

## Post-deploy smoke

- [ ] `/api/health/version` khớp commit đã deploy
- [ ] Tạo bài Quick Start → autorun 1 bước → không 500
- [ ] Series: editor không gắn được bài vào series của người khác (SEC-10)
