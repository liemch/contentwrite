# Preview Deployment Safety

> Cập nhật: 2026-08-06 (WP2)  
> Vercel Preview = `VERCEL_ENV=preview` (PR / branch deploy).

---

## Nguy cơ mặc định (nếu không cấu hình)

| Rủi ro | Mô tả | Trạng thái WP2 |
|--------|-------|----------------|
| Ghi production DB | Preview `DATABASE_URL` = production | **Rủi ro còn lại** — CRUD vẫn ghi nếu cùng URL |
| Migration production | Build/deploy preview chạy migrate | **Đã loại** — không migrate trong build |
| Cron production | Preview trigger cron | **Vercel:** cron chỉ Production |
| Auto-write | Manual/API tick tạo bài | **Blocked** trên Preview |
| Quota AI | Workflow / hero / search | **Blocked** mặc định |
| Publish nội dung thật | Approve/publish API | **Chưa block** — cần preview DB |

---

## Cơ chế bảo vệ đã implement (WP2)

Module: `web/src/lib/deployment-env.ts`

| `VERCEL_ENV` | `ALLOW_PREVIEW_SIDE_EFFECTS` | Hành vi |
|--------------|------------------------------|---------|
| `preview` | unset / ≠ `1` | Block side effects |
| `preview` | `1` | Cho phép AI/auto-write (testing có kiểm soát) |
| `production` | any | Không block |
| local | any | Không block |

### Routes / services blocked on Preview

| Target | Response |
|--------|----------|
| `GET/POST /api/cron/auto-write` | 403 `PREVIEW_SIDE_EFFECT_BLOCKED` |
| `POST /api/auto-write/run` | 403 |
| `POST /api/auto-write/tick` | 403 |
| `chatCompletion()` (NVIDIA) | throws |
| `webSearch()` (Tavily) | throws |
| `generateHeroImage()` | throws |
| `pingNvidia()` / `pingTavily()` | returns disabled message |

### Chưa block on Preview (chấp nhận tạm)

- Article CRUD, approve, publish (DB writes)
- Digest/Series edits
- Settings TFES doc save to DB
- Login/session

→ **Giải pháp khuyến nghị:** Preview dùng **Neon branch database** riêng, không production URL.

---

## Policy khuyến nghị theo môi trường

### Local Development

- `.env.local` với local hoặc dev Neon branch
- `db:migrate:dev` OK
- AI keys dev/staging

### Vercel Preview

1. Tạo Neon **branch** / database preview  
2. Set `DATABASE_URL` preview-only trong Vercel **Preview** env scope  
3. **Không** copy production `NVIDIA_*` / `TAVILY_*` vào Preview (hoặc giữ block mặc định)  
4. **Không** set `ALLOW_PREVIEW_SIDE_EFFECTS` trên Preview PR thông thường  
5. Không chạy `deploy:migrate` against production từ preview context  

### Vercel Production

- Production `DATABASE_URL`
- Migration theo [runbook.md](./runbook.md) — manual
- Full secrets; cron enabled

---

## Nếu Preview vẫn dùng chung Production DB

**Đây là rủi ro cao** — WP2 không thể loại bỏ hoàn toàn mà không:

- Read-only DB user cho Preview, hoặc
- Feature flag tắt mọi mutation API on Preview

Hiện tại:

- AI quota **được bảo vệ**
- Auto-write/cron **được bảo vệ**
- Editor/admin vẫn có thể **sửa/xóa/publish** nếu login Preview + cùng DB

**Hành động bắt buộc:** tách `DATABASE_URL` Preview trong Vercel dashboard.

---

## Vercel Cron và Preview

- Cron trong `web/vercel.json` chỉ áp dụng Production deployment
- Preview URL gọi thủ công `/api/cron/auto-write` → 403 (WP2)

---

## Kiểm tra Preview

```bash
# Sau deploy PR preview
curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://<preview-url>/api/cron/auto-write"
# Expected: 403
```

---

## WP3+ (chưa làm)

- Auto-write resume / long workflow split
- Distributed rate limit
- Optional read-only Preview mode flag
- Full mutation guard when `VERCEL_ENV=preview`

---

## Liên kết

- [Environment variables](./environment-variables.md)
- [Vercel production](./vercel-production.md)
