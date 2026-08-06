# Environment Variables — ContentWrite

> Cập nhật: 2026-08-06 (WP2)  
> **Không commit secret.** Không log giá trị secret.

Phân loại: **Build-time** | **Runtime** | **Production-only** | **Preview-safe** | **Secret** | **Public**

---

## Ma trận theo môi trường

| Variable | Build | Runtime | Secret | Local Dev | Vercel Preview | Vercel Production |
|----------|-------|---------|--------|-----------|----------------|-------------------|
| `DATABASE_URL` | No* | Yes | Yes | Required | Separate DB† | Required |
| `SESSION_SECRET` | No | Yes | Yes | Dev fallback‡ | Required | **Required** |
| `ADMIN_PASSWORD` | No | Yes | Yes | Bootstrap/seed | Optional | Bootstrap only |
| `ADMIN_EMAIL` | No | Yes | No | Optional | Optional | Optional |
| `CRON_SECRET` | No | Yes | Yes | Optional | N/A§ | **Required** if cron |
| `NVIDIA_API_KEY` | No | Yes | Yes | Workflow | Blocked¶ | Required |
| `NVIDIA_BASE_URL` | No | Yes | No | Default | — | Optional override |
| `NVIDIA_MODEL` | No | Yes | No | Default | — | Optional |
| `NVIDIA_REASONING_EFFORT` | No | Yes | No | Default `low` | — | Optional |
| `NVIDIA_TIMEOUT_MS` | No | Yes | No | Optional | — | Optional |
| `NVIDIA_USE_CURL` | No | Yes | No | Local dev | — | — |
| `TAVILY_API_KEY` | No | Yes | Yes | Research | Blocked¶ | Required |
| `FAL_KEY` / `FAL_API_KEY` | No | Yes | Yes | Qwen hero | Blocked¶ | Optional |
| `HERO_STORE` | No | Yes | No | — | — | `data-url` on Vercel |
| `CRON_SECRET` | No | Yes | Yes | Dev open if unset | — | Required |
| `ALLOW_PREVIEW_SIDE_EFFECTS` | No | Yes | No | — | `1` to test AI | **Never** |
| `VERCEL` | Auto | Auto | No | — | `1` | `1` |
| `VERCEL_ENV` | Auto | Auto | No | — | `preview` | `production` |
| `NODE_ENV` | Auto | Auto | No | `development` | `production` | `production` |

\* Prisma `generate` / `validate` không cần live DB connection.  
† **Khuyến nghị:** Neon branch riêng cho Preview — không dùng production URL.  
‡ Dev: `SESSION_SECRET` unset → fallback `ADMIN_PASSWORD` + warning (WP0-A).  
§ Preview cron không schedule; route vẫn blocked.  
¶ WP2: paid side effects blocked unless `ALLOW_PREVIEW_SIDE_EFFECTS=1`.

**Không có `NEXT_PUBLIC_*` secrets** trong codebase hiện tại — client không nhận API keys.

---

## Build-time (CI / Vercel build)

| Variable | CI (GitHub Actions) | Vercel build |
|----------|---------------------|--------------|
| `DATABASE_URL` | **Not required** for build | **Not required** for compile |
| `SESSION_SECRET` | Dummy in CI build step only | Not required for compile |
| AI keys | **Not set** | **Not required** for compile |

CI build dùng dummy secrets chỉ để thỏa mãn module parse nếu cần — **không** gọi API.

---

## Runtime — Production-only

| Variable | Ghi chú |
|----------|---------|
| `SESSION_SECRET` | Bắt buộc; throw nếu thiếu (`auth-secret.ts`) |
| `CRON_SECRET` | Bắt buộc cho cron auth trên production |
| `DATABASE_URL` | Neon PostgreSQL |

---

## Runtime — Preview-safe policy

Preview **có thể** dùng:

- `DATABASE_URL` (preview branch — khuyến nghị)
- `SESSION_SECRET` (preview-specific)
- Auth vars cho login test

Preview **không nên** dùng production values cho:

- `DATABASE_URL` (ghi production)
- `NVIDIA_*`, `TAVILY_*`, `FAL_*` (quota) — code block mặc định

Override có kiểm soát: `ALLOW_PREVIEW_SIDE_EFFECTS=1` (chỉ staging/preview DB).

---

## AI-TFES / content

| Mechanism | Env? |
|-----------|------|
| TFES markdown trên disk | `content/ai-tfes` — synced at build from `AI-TFES/` |
| TFES DB overrides | `TfesDocument` table — runtime `DATABASE_URL` |
| Domain profiles | Files + DB override |

Không có env riêng cho từng TFES file — cấu hình qua DB hoặc repo content.

---

## GitHub Actions secrets

**Không cần** production secrets trong CI (WP2):

- Test dùng dummy `DATABASE_URL` (vitest setup)
- Build dùng dummy `SESSION_SECRET` / `ADMIN_PASSWORD`
- Không gọi NVIDIA/Tavily trong CI

---

## Kiểm tra thủ công sau deploy

```bash
# Production — không in secret
vercel env ls
# App: login, list articles, admin health (admin session)
```

---

## Liên kết

- [Vercel production](./vercel-production.md)
- [Preview safety](./preview-safety.md)
- [Runbook](./runbook.md)
- `web/.env.example`
