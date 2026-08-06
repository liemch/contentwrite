# WP0-B — Security Completion & Functional Quick Fixes

| Field | Value |
|-------|-------|
| **Status** | Done (2026-08-06) |
| **Complexity** | S |
| **Prerequisite** | WP0-A |

---

## Mục tiêu

Hoàn thiện security multi-user còn lại sau WP0-A: inactive session, temp password API, tab bug — **không** migration/CI/workflow refactor.

---

## Phạm vi

### 1. Inactive user & session (SEC-6)

- JWT payload: `active: true`, `sv` (user.updatedAt ms) tại login
- `requireUser()` dùng `isSessionInvalidated()` — inactive hoặc user changed sau khi phát hành JWT
- Middleware: từ chối JWT có `active === false` (không DB)
- SSR protected pages: `requireUserOrRedirect()` — dashboard, library, home redirect
- **Không** query DB trong middleware

### 2. Temporary password (SEC-13)

- Loại bỏ `temporaryPassword` khỏi `POST/PATCH /api/users` responses
- Admin UI giữ password từ form / client-generated reset (hiển thị một lần trên màn hình)
- Password chỉ lưu bcrypt hash trong DB

### 3. Tab invalid (SMELL-5)

- `setTab("review")` → `tabForFinalVerificationFailure()` → `"knowledge"`
- Module `article-tabs.ts` + type-safe `resolveArticleTabKey`

---

## Ngoài phạm vi

- Token blacklist / Redis sessions
- Bcrypt rounds 12+ (Group C)
- Client-only pages guard (API đã từ chối inactive)
- WP1+

---

## Findings addressed

| ID | Status |
|----|--------|
| SEC-6 Inactive user session | **Done** (API + SSR + sv stamp; middleware JWT-only partial) |
| SEC-13 Temp password in API | **Done** |
| SMELL-5 Invalid tab `review` | **Done** |

---

## Files changed

### New

- `web/src/lib/auth-session.ts`
- `web/src/lib/auth-guard.ts`
- `web/src/lib/article-tabs.ts`
- `web/src/lib/auth-session.test.ts`
- `web/src/lib/article-tabs.test.ts`

### Modified

- `web/src/lib/auth.ts`
- `web/src/middleware.ts`
- `web/src/app/api/auth/login/route.ts`
- `web/src/app/api/users/route.ts`
- `web/src/app/api/users/[id]/route.ts`
- `web/src/app/page.tsx`
- `web/src/app/dashboard/page.tsx`
- `web/src/app/library/page.tsx`
- `web/src/app/library/[id]/page.tsx`
- `web/src/app/articles/[id]/page.tsx`
- `web/src/components/users-admin-panel.tsx`

---

## Database impact

**None.** Không schema migration.

---

## Environment variables

**None new.**

---

## Session behavior after deactivate

| Layer | Behavior |
|-------|----------|
| API `requireUser()` | Từ chối ngay (`active=false` hoặc `updatedAt > sv`) |
| SSR `requireUserOrRedirect()` | Redirect `/login` |
| Middleware | JWT hợp lệ vẫn qua (legacy); JWT `active:false` bị chặn |
| Client pages (settings, articles…) | Shell load; API 401 |

**Chấp nhận tạm thời:** Client-only pages không SSR guard — inactive user thấy layout trống khi API fail. Không token blacklist.

**Legacy JWT (không có `sv`):** vẫn bị chặn khi `active=false`; role/permission lấy từ DB qua `requireUser()`.

---

## Acceptance criteria

- [x] Inactive user rejected by `requireUser()` (API)
- [x] SSR library/dashboard/home reject inactive user
- [x] Deactivate user invalidates session when JWT has `sv` and `updatedAt` changes
- [x] No password in users API JSON responses
- [x] Admin UI shows password from form only
- [x] Final verification failure opens `knowledge` tab
- [x] WP0-A access tests still pass

---

## Rollback

Revert WP0-B commit. Users must re-login to get new JWT fields (backward compatible — old JWTs still work with DB active check).

---

## Next WP

**WP1** — Database & Deployment Safety (remove `db push`, versioned migrations).
