# Migration Strategy — ContentWrite

> Cập nhật: 2026-08-06 (WP1)

---

## Nguồn sự thật (single source of truth)

**Canonical:** `web/prisma/schema.prisma`

Mọi thay đổi schema:

1. Sửa `schema.prisma`
2. Tạo migration mới: `npm run db:migrate:dev -- --name descriptive_name` (local only)
3. Review SQL trong `prisma/migrations/<timestamp>_<name>/migration.sql`
4. Deploy: `npm run db:migrate:deploy` (staging/production — **thủ công**, không auto trong build)

---

## Lệnh Prisma — khi nào dùng

| Lệnh | Môi trường | Mục đích |
|------|------------|----------|
| `db:generate` | mọi nơi | Generate client — **không** đụng DB |
| `db:validate` | CI / pre-deploy | Kiểm tra schema.prisma hợp lệ |
| `db:migrate:dev` | **local dev only** | Tạo + apply migration khi phát triển |
| `db:migrate:deploy` | staging / production | Apply migration đã commit |
| `db:migrate:status` | staging / production | Kiểm tra drift vs `_prisma_migrations` |
| `db:migrate:resolve` | brownfield once | Đánh dấu migration đã apply mà không chạy SQL |
| `db:push` | **deprecated** | Emergency local only — bypass version history |

**Không** dùng `migrate dev` hoặc `db push` trên production.

**Không** gọi migration trong `npm run build` hoặc Vercel build hook.

---

## Brownfield vs greenfield

### Greenfield (database trống)

```bash
cd web
npm run db:migrate:deploy
npm run db:generate
npm run build
```

Applies: baseline → series_created_by_id (second is no-op if column exists from baseline).

### Brownfield (Neon đã có schema từ manual SQL / db push)

**Bước 1 — Backup** (Neon snapshot / pg_dump)

**Bước 2 — Baseline resolve** (không chạy CREATE toàn bộ):

```bash
npm run db:migrate:resolve -- --applied 20260806100000_baseline
```

**Bước 3 — Deploy incremental**:

```bash
npm run db:migrate:deploy
```

Migration `20260806100100_series_created_by_id` idempotent — an toàn nếu đã chạy `20260806_series_created_by.sql`.

Nếu column đã có, có thể resolve thay vì deploy:

```bash
npm run db:migrate:resolve -- --applied 20260806100100_series_created_by_id
```

**Bước 4 — Verify**:

```bash
npm run db:migrate:status
npm run db:validate
```

---

## Rollback policy

### Application rollback (khuyến nghị)

Redeploy previous Vercel release. Schema có thể **ahead** of old app — app cũ phải tương thích backward (nullable columns OK).

### Database rollback

| Migration | Reversible? | Ghi chú |
|-----------|-------------|---------|
| `20260806100000_baseline` | **Không** | Drop toàn schema = mất dữ liệu |
| `20260806100100_series_created_by_id` | **Không an toàn** | `DROP COLUMN createdById` mất ownership đã gán |

**Không** cung cấp rollback SQL giả. Nếu migration fail giữa chừng:

- Idempotent migration (`series_created_by_id`): re-run `migrate deploy`
- Baseline fail trên brownfield: **dừng**, restore snapshot, dùng `migrate resolve` thay vì chạy lại baseline

---

## Series ownership backfill

**Không** auto backfill trong migration.

Script: `npm run db:report:series-owners` — liệt kê `Series` với `createdById IS NULL`.

Admin assign thủ công:

```sql
UPDATE "Series" SET "createdById" = '<user-id>' WHERE "id" = '<series-id>';
```

Chỉ chạy sau khi xác định owner đúng từ nguồn đáng tin (không suy đoán từ editor hiện tại).

---

## Staging workflow (đề xuất)

1. Restore production snapshot → staging DB (hoặc branch Neon)
2. `deploy:precheck` → `deploy:migrate` → `deploy:build`
3. Smoke test app
4. Lặp lại trên production với backup

---

## Giới hạn xác nhận

- Agent **chưa** kết nối production/staging DB trong WP1.
- Trạng thái `_prisma_migrations` production **chưa kiểm tra**.
- Drift thực tế: operator chạy `db:migrate:status` + so sánh với [schema-artifact-inventory.md](./schema-artifact-inventory.md).
