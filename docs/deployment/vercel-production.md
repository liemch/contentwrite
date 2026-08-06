# Vercel Production — ContentWrite

> Cập nhật: 2026-08-06 (WP2)  
> Production hiện tại: **Vercel App** + PostgreSQL bên ngoài (Neon) + region `sin1`.

---

## Vercel project settings (xác nhận từ repo)

| Setting | Giá trị | Nguồn |
|---------|---------|-------|
| Root Directory | `web` | `/vercel.json` |
| Framework | Next.js | `web/vercel.json` |
| Build Command | `npm run vercel-build` → **`npm run build`** | `web/package.json` |
| Install Command | mặc định `npm install` / `npm ci` | Vercel default |
| Output | Next.js default | — |
| Node.js | **20.x** (khuyến nghị) | `web/.nvmrc`, `engines` |
| Region | `sin1` | `web/vercel.json` |

---

## Build trên Vercel (WP1 + WP2)

**Đã implement:**

- `vercel-build` = `npm run build` (một nguồn, không drift)
- Build **không** gọi `prisma db push`
- Build **không** gọi `prisma migrate deploy`
- `postinstall` + build: `prisma generate` only (không cần `DATABASE_URL` để compile)
- Fonts: `@fontsource/*` bundled — **không** fetch Google Fonts lúc build
- `prebuild`: sync `AI-TFES` → `content/ai-tfes` (filesystem read-only source trong repo)

**Không gọi trong build:** NVIDIA, Tavily, FAL, production DB migration.

---

## Runtime (serverless)

- Mỗi request = instance riêng; **không** shared memory giữa instances
- Filesystem `/tmp` tạm; `content/ai-tfes` read từ deployment bundle
- Default route runtime: **Node.js** (Prisma, `pg`, `child_process` trong NVIDIA curl path)
- Middleware: Edge-compatible (`jose` only — không import Prisma)

### Function timeout (maxDuration)

| Route | maxDuration | Rủi ro |
|-------|-------------|--------|
| `/api/articles/[id]/actions` | 300s | Workflow AI dài — Hobby/Pro limit |
| `/api/cron/auto-write` | 300s | Cron + auto-write (WP3) |
| `/api/auto-write/run`, `/tick` | 300s | WP3 |
| `/api/articles/[id]/hero` | 180s | Image gen |
| `/api/settings/suggest-seeds` | 120s | LLM + Tavily |
| `/api/health/*` | 60s | Ping integrations |

Vercel plan giới hạn thực tế có thể **thấp hơn** `maxDuration` khai báo — xem WP3.

---

## Cron (production only)

`web/vercel.json`:

```json
"crons": [{ "path": "/api/cron/auto-write", "schedule": "0 2 * * *" }]
```

- Vercel Cron chạy trên **Production** deployment
- Auth: `Authorization: Bearer $CRON_SECRET`
- Preview: route trả **403** side-effect blocked (WP2 guard)

---

## Production migration (tách khỏi Vercel build)

Theo [runbook.md](./runbook.md) — operator chạy **thủ công** trước/sau deploy:

1. Backup DB  
2. `npm run db:migrate:resolve` (brownfield lần đầu)  
3. `npm run deploy:migrate`  
4. Deploy app trên Vercel  
5. Smoke test  

**Vercel build không migrate production.**

---

## Environment variables

Xem [environment-variables.md](./environment-variables.md).

Production bắt buộc tối thiểu:

- `DATABASE_URL`
- `SESSION_SECRET` (≠ `ADMIN_PASSWORD`)
- `NVIDIA_API_KEY`, `TAVILY_API_KEY` (workflow)
- `CRON_SECRET` (nếu bật cron)
- `FAL_KEY` (optional — Qwen hero)

---

## Preview vs Production

| | Preview | Production |
|---|---------|------------|
| `VERCEL_ENV` | `preview` | `production` |
| Cron schedule | Không (Vercel default) | Có |
| Side effects AI/auto-write | **Blocked** mặc định | Allowed |
| Migration | **Không** auto | Manual runbook |
| DB khuyến nghị | Branch Neon riêng | Production DB |

Chi tiết: [preview-safety.md](./preview-safety.md).

---

## Vercel incompatibility register (WP2 — chưa sửa hết)

Chuyển **WP3** trừ khi ghi chú khác:

| ID | Thành phần | Vấn đề | WP |
|----|------------|--------|-----|
| V-1 | `login-rate-limit.ts` | In-memory Map — không distributed | Chấp nhận tạm (WP0) |
| V-2 | `tfes-docs.ts` overrideCache | Per-instance cache, TTL 30s | WP4/WP5 |
| V-3 | Auto-write cron vs timeout | Job dài > wall clock | **WP3** |
| V-4 | Workflow trong 1 request | Resume phụ thuộc client/cron gọi lại | **WP3** |
| V-5 | `AutoWriteWatcher` | No-op (đã tắt trên prod UI) | WP3 dead code |
| V-6 | Hero `/public/generated` | Ephemeral trên serverless — dùng data-url trên Vercel | Documented in hero.ts |
| V-7 | Preview + shared `DATABASE_URL` | Ghi DB nếu user login + thao tác CRUD | Doc + AI block; full read-only chưa |

---

## CI vs Vercel

- **GitHub Actions** (`.github/workflows/ci.yml`): validate, typecheck, test, lint, build — **không deploy**
- **Vercel**: build + deploy khi merge; PR → Preview Deployment
- Merge nên chờ CI pass; migration production vẫn là bước operator riêng

---

## Liên kết

- [Deploy runbook](./runbook.md)
- [Environment variables](./environment-variables.md)
- [Preview safety](./preview-safety.md)
- [WP2 work package](../work-packages/WP2-quality-gate-vercel.md)
