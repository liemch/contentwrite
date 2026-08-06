# WP1 — Database & Deployment Safety

> Trạng thái: **Done** (2026-08-06)  
> Phụ thuộc: không (song song WP0-A/B)

---

## Mục tiêu đã đạt

| # | Mục tiêu | Trạng thái |
|---|----------|------------|
| 1 | Loại bỏ `prisma db push` khỏi build | **Done** |
| 2 | Chuẩn hóa migration có version | **Done** — `20260806100000_baseline`, `20260806100100_series_created_by_id` |
| 3 | Nguồn sự thật duy nhất cho schema | **Done** — `web/prisma/schema.prisma` |
| 4 | Giảm schema drift | **Partial** — inventory + baseline; legacy SQL giữ làm reference |
| 5 | Deploy flow an toàn | **Done** — [runbook](../deployment/runbook.md) |
| 6 | Không mất dữ liệu | **Done** — idempotent migration; không auto backfill owner |
| 7 | Không đổi behavior nghiệp vụ | **Done** |

---

## Thay đổi build script

### Trước

```json
"build": "prisma generate && prisma db push && next build",
"vercel-build": "prisma generate && prisma db push && next build"
```

### Sau

```json
"build": "npm run db:generate && next build",
"vercel-build": "npm run db:generate && next build"
```

Scripts mới: `db:generate`, `db:validate`, `db:migrate:deploy`, `db:migrate:status`, `db:migrate:dev`, `db:migrate:resolve`, `deploy:precheck`, `deploy:migrate`, `deploy:build`, `db:report:series-owners`.

`db:push` vẫn tồn tại với cảnh báo deprecation — **không** dùng trong production.

---

## Migrations đã tạo

| Migration | Mục đích | Reversible |
|-----------|----------|------------|
| `20260806100000_baseline` | Full schema cho DB mới | **Không** — brownfield dùng `migrate resolve` |
| `20260806100100_series_created_by_id` | `Series.createdById` idempotent | **Không** an toàn — nullable giữ legacy |

Chi tiết rollback: [migration-strategy.md](../database/migration-strategy.md).

---

## Brownfield onboarding (bắt buộc trước deploy lần đầu)

Database đã tồn tại (Neon + manual SQL / db push):

```bash
cd web
npm run db:migrate:resolve -- --applied 20260806100000_baseline
npm run db:migrate:deploy   # chỉ chạy migration chưa apply (vd. series_created_by_id)
npm run db:migrate:status
```

Nếu `20260806_series_created_by.sql` đã chạy thủ công:

```bash
npm run db:migrate:resolve -- --applied 20260806100100_series_created_by_id
```

**Chưa xác nhận production** — operator phải chạy `db:migrate:status` trên staging/production.

---

## Series legacy ownership

- `Series.createdById` nullable — tương thích dữ liệu cũ.
- **Không** auto gán owner.
- Script báo cáo: `npm run db:report:series-owners` (dry-run).
- Admin gán thủ công sau khi xác định user đúng.

---

## Kiểm thử đã chạy (local)

| Command | Kết quả |
|---------|---------|
| `npm run test` | Pass (23 tests) |
| `npm run typecheck` | Pass |
| `npm run lint` | Pre-existing errors (React hooks) — không do WP1 |
| `npm run build` | Pass — **không mutate DB** |
| `npm run db:validate` | Pass |

`db:migrate:status` / backfill report: cần `DATABASE_URL` thật — xem báo cáo cuối session.

---

## Rủi ro còn lại

1. Production chưa baseline-resolve — deploy `migrate deploy` có thể fail trên DB brownfield.
2. Legacy SQL vẫn trong repo — dev mới có thể chạy nhầm; dùng inventory doc.
3. Không có automated CI migration check (WP2).
4. Schema thực tế production **chưa được agent xác nhận** (không có DATABASE_URL).

---

## WP tiếp theo đề xuất

**WP2 — Quality Gate**: CI chạy typecheck, test, lint (baseline), validate schema; optional migrate diff check.

---

## Liên kết

- [Migration strategy](../database/migration-strategy.md)
- [Schema artifact inventory](../database/schema-artifact-inventory.md)
- [Deploy runbook](../deployment/runbook.md)
- [Technical debt](../technical-debt.md) — TD-3, TD-4 resolved
