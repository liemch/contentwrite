# Schema Artifact Inventory

> Cập nhật: 2026-08-06 (WP1)  
> **Single source of truth:** `web/prisma/schema.prisma`

Phân loại: **Canonical migration** | **Legacy/manual** | **One-time backfill** | **Không còn sử dụng** | **Cần chuyển Prisma migration** | **Cần giữ (Prisma không biểu diễn)**

---

## Tóm tắt drift

| Artifact | Trạng thái | Rủi ro | Hành động |
| -------- | ---------- | ------ | --------- |
| `schema.prisma` | **Canonical SSOT** | Thấp nếu migrate deploy đúng | Mọi schema change qua đây |
| `migrations/20260806100000_baseline/` | **Canonical migration** (greenfield) | Cao nếu chạy nhầm trên brownfield | Brownfield: `migrate resolve --applied` |
| `migrations/20260806100100_series_created_by_id/` | **Canonical migration** (incremental) | Thấp — idempotent | `migrate deploy` hoặc resolve nếu đã manual |
| `migrations/migration_lock.toml` | **Canonical** | Thấp | Commit cùng migrations |
| `migrations/manual_users_quota.sql` | **Legacy/manual** | Trung bình — duplicate history | Giữ reference; **không** chạy trên DB đã baseline |
| `migrations/manual_writing_prefs.sql` | **Legacy/manual** | Trung bình | Giữ reference; absorbed in baseline |
| `migrations/manual_tfes_documents.sql` | **Legacy/manual** | Trung bình | Giữ reference; absorbed in baseline |
| `sql/20260801_add_article_gallery_json.sql` | **Legacy/manual** | Trung bình | Deprecated; use migrations |
| `sql/20260801_add_article_desk_json.sql` | **Legacy/manual** | Trung bình | Deprecated; use migrations |
| `sql/20260804_tfes_v16_workflow.sql` | **Legacy/manual** | **Cao** — không idempotent (CREATE TYPE) | **Không** chạy lại; baseline covers |
| `sql/20260804_add_workflow_version.sql` | **Legacy/manual** | Trung bình | Absorbed in baseline |
| `sql/20260804_tfes_lifecycle_contract.sql` | **Legacy/manual** | Trung bình | Absorbed in baseline |
| `sql/20260804_article_shape_manager.sql` | **Legacy/manual** | Trung bình | Absorbed in baseline |
| `sql/20260806_series_created_by.sql` | **Legacy/manual** → superseded | Thấp | Superseded by `20260806100100_*`; giữ file |
| `scripts/add-gallery-json.mjs` | **Legacy/manual runner** | Trung bình | Chỉ dùng nếu DB cực cũ thiếu column |
| `scripts/add-desk-json.mjs` | **Legacy/manual runner** | Trung bình | Tương tự |
| `scripts/seed-admin.mjs` | **One-time backfill** | Thấp | Seed admin user — không schema |
| `scripts/report-series-without-owner.mjs` | **One-time backfill (report)** | Thấp | Dry-run; WP1 mới |
| `_prisma_migrations` (DB table) | **Runtime** | Cao nếu empty trên prod brownfield | Baseline resolve trước deploy |

---

## Chi tiết theo file

### Canonical

#### `web/prisma/schema.prisma`

- **Trạng thái:** SSOT
- **Gồm:** User, Article, Workflow*, Series (createdById nullable), Digest, KnowledgeRecord, AutoWriteConfig, TfesDocument, ArticleShapeProfile
- **Hành động:** Mọi thay đổi tương lai qua migrate dev → commit SQL

#### `web/prisma/migrations/20260806100000_baseline/migration.sql`

- **Trạng thái:** Canonical — full CREATE from `prisma migrate diff --from-empty`
- **Reversible:** Không
- **Brownfield:** Mark applied, do not execute

#### `web/prisma/migrations/20260806100100_series_created_by_id/migration.sql`

- **Trạng thái:** Canonical incremental
- **Thay thế:** `sql/20260806_series_created_by.sql`
- **Reversible:** Không an toàn

### Legacy manual (`prisma/migrations/manual_*`)

| File | Nội dung chính | Absorbed in baseline? |
|------|----------------|----------------------|
| `manual_users_quota.sql` | User table, Article.createdById, quota | Yes |
| `manual_writing_prefs.sql` | targetWordCount, avoidFormats, AutoWrite defaults | Yes |
| `manual_tfes_documents.sql` | TfesDocument table | Yes |

**Hành động:** Giữ file; đánh dấu deprecated trong docs; không xóa (chưa chứng minh mọi env đã migrate).

### Legacy manual (`prisma/sql/*`)

| File | Ghi chú |
|------|---------|
| `20260801_add_article_gallery_json.sql` | galleryJson column |
| `20260801_add_article_desk_json.sql` | deskJson column |
| `20260804_tfes_v16_workflow.sql` | WorkflowState enum, WorkflowArtifact, WorkflowTransition — **dangerous re-run** |
| `20260804_add_workflow_version.sql` | workflowVersion |
| `20260804_tfes_lifecycle_contract.sql` | contentVersion, KnowledgeRecord lifecycle |
| `20260804_article_shape_manager.sql` | Article shape + ArticleShapeProfile |
| `20260806_series_created_by.sql` | Superseded by versioned migration |

---

## Schema drift matrix (source-confirmed)

So sánh **schema.prisma** vs **migration history** vs **manual SQL** (không có live DB trong WP1):

| Concern | schema.prisma | baseline migration | manual SQL history | Ghi chú |
|---------|---------------|-------------------|-------------------|---------|
| Series.createdById | Yes, nullable | Yes | Yes (20260806) | Aligned |
| Workflow v1.6 tables | Yes | Yes | Yes (20260804) | Aligned in SSOT |
| User multi-tenant | Yes | Yes | Yes (manual_users) | Aligned |
| galleryJson / deskJson | Yes | Yes | Yes (20260801) | Aligned |

**Giới hạn:** Trạng thái **production database thực tế** chưa xác nhận. Operator phải:

```bash
cd web && npm run db:migrate:status
```

và so sánh cột với schema.prisma (Neon SQL editor / `\d "Series"`).

---

## Cần giữ vì Prisma không biểu diễn

Hiện **không có** — toàn bộ schema trong `schema.prisma`. Manual SQL chỉ là lịch sử triển khai brownfield.
