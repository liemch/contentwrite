# Multi-user Access Model

> Cập nhật: 2026-08-06 — sau WP0-B  
> **Nguồn sự thật:** `web/src/lib/access.ts`, `web/src/lib/auth.ts`

---

## Nguyên tắc

1. **Authentication** — JWT cookie (`httpOnly`, `sameSite=lax`, 7 ngày).
2. **Authorization** — luôn reload user từ DB qua `requireUser()` cho quyết định phân quyền.
3. **Ownership** — resource có `createdById`; editor chỉ truy cập row của mình.
4. **Admin bypass** — `UserRole.ADMIN` thấy/sửa mọi resource (kể cả legacy `createdById = null`).
5. **404 vs 403** — truy cập resource không thuộc quyền → **404** (không lộ tồn tại).
6. **Published reader content** — `cleanPublish` của bài `PUBLISHED` có thể đọc bởi mọi user đăng nhập (library); draft chỉ owner/admin.

---

## Session layers

| Layer | Mechanism | Trust level |
|-------|-----------|-------------|
| Middleware | JWT signature + reject `active:false` | Gate login — **không** DB |
| API handlers | `requireUser()` → DB + `sv` stamp | **Source of truth** |
| SSR pages | `requireUserOrRedirect()` | **Source of truth** |
| JWT claims | `getSession()` | Không dùng cho authZ |

### JWT payload (từ WP0-B login)

| Claim | Mục đích |
|-------|----------|
| `active: true` | Middleware có thể từ chối nếu `false` |
| `sv` | `user.updatedAt.getTime()` — invalidate khi admin deactivate/đổi role/password |

### Đã xác nhận từ code (WP0-A + WP0-B)

- `requireUser()` + `isSessionInvalidated()` — từ chối inactive và session cũ sau user update
- Dashboard, library, home dùng `requireUserOrRedirect()`
- API routes dùng `requireUser()` / `requireAdmin()`

### Chấp nhận tạm thời

- Middleware **không** query DB — JWT legacy (không `sv`) vẫn qua middleware nếu chưa hết hạn; API/SSR vẫn chặn inactive ngay
- Client-only pages (settings, articles detail…) — inactive user có thể thấy shell; API trả 401
- Không session blacklist — deactivate có hiệu lực ngay tại API/SSR; middleware-only navigation window với JWT cũ không `sv` nhưng user đã inactive vẫn bị `requireUser()` chặn

---

## Resource matrix

| Resource | Owner field | List scope (editor) | Read | Write | Delete |
|----------|-------------|---------------------|------|-------|--------|
| **Article** | `createdById` | `editorialWhere()` | owner/admin; API enforced | owner/admin | owner/admin |
| **Digest** | `createdById` | `ownedResourceWhere()` | owner/admin | owner/admin | owner/admin |
| **Series** | `createdById` (WP0-A) | all metadata (list) | articles sanitized | owner/admin | owner/admin |
| **User** | — | admin only | admin/self | admin | admin |
| **AutoWriteConfig** | singleton | admin | admin | admin | — |
| **TfesDocument** | — | admin | admin | admin | — |

### Series article `cleanPublish`

` sanitizeSeriesArticlesForUser()`:

- Admin / article owner / `workflowState === PUBLISHED` → giữ `cleanPublish`
- Else → `cleanPublish: null`

---

## Editorial memory

| Caller | Scope |
|--------|-------|
| Admin | Domain-wide published + all knowledge records |
| Editor | Own knowledge records + own published titles; series siblings filtered (no draft titles from others) |
| Workflow LLM | Theo `article.createdById` creator role |

API: `GET /api/editorial-memory` — truyền `accessScope` vào `getRelatedAngles()`.

---

## Secrets

| Variable | Rule |
|----------|------|
| `SESSION_SECRET` | **Bắt buộc production** — JWT signing |
| `ADMIN_PASSWORD` | Bootstrap + login only — **không** fallback JWT trong production |
| Dev | Fallback ADMIN_PASSWORD + console warning |

Implementation: `web/src/lib/auth-secret.ts`

---

## Login protection (WP0-A)

- Rate limit: 10 failures / 15 phút / IP (`x-forwarded-for`)
- In-process only — **giới hạn serverless** (partial protection)
- Open redirect blocked: `safeInternalPath()` — chỉ path `/...` nội bộ

---

## Health endpoints

| Path | Access |
|------|--------|
| `/api/health/tavily` | Authenticated (middleware) |
| `/api/health/integrations` | **Admin only** (WP0-A) — không còn public |

---

## User admin API (WP0-B)

| Endpoint | Password in response |
|----------|---------------------|
| `POST /api/users` | **Không** — admin copy từ form |
| `PATCH /api/users/[id]` | **Không** — admin copy từ client-generated reset |
| `GET /api/users` | **Không** |

Password chỉ lưu `passwordHash` (bcrypt). Admin UI hiển thị one-time trên màn hình, không qua JSON.

---

## Legacy data

| Case | Policy |
|------|--------|
| `Article.createdById = null` | Admin only (editor cannot access) |
| `Digest.createdById = null` | Admin only write |
| `Series.createdById = null` | Admin only write; created before WP0-A |

**Migration SQL:** `web/prisma/sql/20260806_series_created_by.sql` — chạy thủ công trên DB; không auto-run.

---

## Cần kiểm tra thêm

- [ ] Client-only protected pages có cần SSR layout guard không (settings, articles, digests, series)
- [x] Library SSR — `requireUserOrRedirect()` (WP0-B)
- [x] Digest list ẩn legacy null rows khỏi editor (WP0-A filter `createdById`)

---

## Liên kết

- [WP0-A](../work-packages/WP0-A-security-multi-user-isolation.md)
- [WP0-B](../work-packages/WP0-B-security-completion.md)
- [Article workflow](../workflow/article-create.md)
