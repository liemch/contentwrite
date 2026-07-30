# Hướng dẫn cấu hình — ContentTechhub (AI-TFES Web)

Website nội bộ viết bài theo **AI-TFES**, dùng **GLM-5.2** (NVIDIA NIM) + **Tavily** (web search).

---

## 1. Tổng quan kiến trúc

```
Browser (nội bộ, login admin)
    ↓
Next.js trên Vercel (thư mục web/)
    ↓
PostgreSQL (Neon free) — lưu bài, pipeline, knowledge
    ↓
Tavily API — search nguồn thật (bước Research)
    ↓
NVIDIA NIM — GLM-5.2 (Insight Gate → Viết → Fact-check)
```

**Thư mục quan trọng:**

| Path | Vai trò |
|------|---------|
| `AI-TFES/` | Prompt & template gốc (Operating Prompt, Daily Task…) |
| `web/` | Website MVP |
| `web/content/ai-tfes/` | Copy prompt (auto sync khi build) |
| `web/.env` | Biến môi trường local (không commit) |
| `web/.env.example` | Mẫu biến môi trường |

---

## 2. Chuẩn bị trước khi cấu hình

Cần có sẵn:

- [ ] Tài khoản [Vercel](https://vercel.com)
- [ ] **NVIDIA API Key** (`nvapi-...`) — endpoint `https://integrate.api.nvidia.com/v1`, model `openai/gpt-oss-120b`
- [ ] **Tavily API Key** (`tvly-...`) — [tavily.com](https://tavily.com) → Dashboard → API Keys
- [ ] Repo/code đã push lên GitHub (hoặc import trực tiếp)

**Không dán API key vào chat/git.** Chỉ đặt trong Vercel Environment Variables hoặc file `.env` local.

---

## 3. Biến môi trường (bắt buộc)

Copy mẫu:

```bash
cd web
cp .env.example .env
```

| Biến | Bắt buộc | Mô tả |
|------|:--------:|-------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Neon) |
| `ADMIN_PASSWORD` | ✅ | Mật khẩu đăng nhập website (1 admin) |
| `SESSION_SECRET` | ✅ | Chuỗi ngẫu nhiên ≥32 ký tự (ký session) |
| `NVIDIA_API_KEY` | ✅ | API key NVIDIA NIM (viết bài + hero FLUX.1-dev) |
| `TAVILY_API_KEY` | ✅ | API key Tavily search |
| `FAL_KEY` | Tuỳ chọn | Hero **Qwen-Image** qua fal.ai (không có thì chỉ dùng Flux) |
| `NVIDIA_BASE_URL` | Khuyến nghị | `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | Khuyến nghị | `openai/gpt-oss-120b` (Hobby chậm thì thử `openai/gpt-oss-20b`) |
| `NVIDIA_REASONING_EFFORT` | Khuyến nghị | `low` (gpt-oss; mặc định medium dễ timeout) |

**Ví dụ `.env` local:**

```env
ADMIN_PASSWORD=MatKhauAdminCuaBan
SESSION_SECRET=abc123xyz-random-string-at-least-32-chars

DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/neondb?sslmode=require

NVIDIA_API_KEY=nvapi-xxxx
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=openai/gpt-oss-120b
NVIDIA_REASONING_EFFORT=low

TAVILY_API_KEY=tvly-xxxx

# Tuỳ chọn — Gen hero Qwen-Image (https://fal.ai/dashboard/keys)
FAL_KEY=fal-xxxx

# Auto-write cron (Vercel Cron)
CRON_SECRET=random-cron-secret
```

### Hero image (song song 2 model)

Trên trang bài → khối **Hero image**:

| Nút | Provider | Key |
|-----|----------|-----|
| **Gen FLUX.1-dev** | NVIDIA `flux.1-dev` | `NVIDIA_API_KEY` |
| **Gen Qwen-Image** | fal.ai `fal-ai/qwen-image` | `FAL_KEY` |

Ảnh lưu vào `public/generated/heroes/` và gắn vào bản sạch Markdown.

### Auto-write

Trang **Auto** (`/settings`):

- Bật/tắt lịch viết bài tự động
- Mỗi ngày giờ cố định **hoặc** mỗi N giờ
- Domain / seed topics / danh sách chủ đề thêm
- Giới hạn số bài **Chờ duyệt** (không spam)
- Nút **Chạy ngay 1 bài** để test

Bài auto **chỉ dừng ở Chờ duyệt** — không tự Approve/Publish. Vercel Cron gọi `/api/cron/auto-write` mỗi giờ (cần `CRON_SECRET`).

---

## 4. Tạo database miễn phí (Neon)

### Cách A — Qua Vercel (khuyến nghị)

1. Deploy/import project lên Vercel (**Root Directory = `web`**)
2. Project → tab **Storage**
3. **Create Database** → chọn **Postgres** (Neon)
4. **Connect** database vào project
5. Vercel tự thêm `DATABASE_URL` vào Environment Variables

### Cách B — Neon trực tiếp

1. Đăng ký [neon.tech](https://neon.tech)
2. **New Project** → copy **Connection string** (PostgreSQL)
3. Dán vào Vercel **Settings → Environment Variables** → `DATABASE_URL`
4. Local: dán cùng string vào `web/.env`

### Khởi tạo schema (chạy 1 lần)

Sau khi có `DATABASE_URL`:

```bash
cd web
npm install
npx prisma db push
```

Thành công → tạo bảng `Article`, `KnowledgeRecord`.

---

## 5. Chạy local (dev)

```bash
cd web
cp .env.example .env
# Điền đủ biến ở mục 3

npm install
npx prisma db push
npm run dev
```

Mở: **http://localhost:3000**

- `/login` — đăng nhập bằng `ADMIN_PASSWORD`
- `/dashboard` — danh sách bài
- `/articles/new` — tạo bài mới

---

## 6. Deploy lên Vercel (checklist từng bước)

### Bước 1 — Import project

1. [vercel.com/new](https://vercel.com/new)
2. Import Git repository
3. **Root Directory:** `web` ← quan trọng
4. Framework: Next.js (auto detect)

### Bước 2 — Environment Variables

**Settings → Environment Variables**, thêm tất cả biến mục 3:

| Name | Environment |
|------|-------------|
| `ADMIN_PASSWORD` | Production, Preview, Development |
| `SESSION_SECRET` | Production, Preview, Development |
| `DATABASE_URL` | Production, Preview, Development |
| `NVIDIA_API_KEY` | Production, Preview, Development |
| `TAVILY_API_KEY` | Production, Preview, Development |
| `NVIDIA_BASE_URL` | Production, Preview, Development |
| `NVIDIA_MODEL` | Production, Preview, Development |

### Bước 3 — Database

- Tạo Neon qua **Storage** (mục 4) nếu chưa có
- Chạy `npx prisma db push` từ máy local (cùng `DATABASE_URL` production) **hoặc** Vercel CLI:

```bash
cd web
npx vercel env pull .env.local
npx prisma db push
```

### Bước 4 — Deploy

- Push code → Vercel auto deploy
- Hoặc **Deployments → Redeploy**

### Bước 5 — Kiểm tra

1. Mở URL Vercel → redirect `/login`
2. Đăng nhập `ADMIN_PASSWORD`
3. Tạo bài test → **Chạy 1 bước** (Research) trước
4. Nếu OK → **Chạy full pipeline**

---

## 7. Luồng sử dụng sau khi cấu hình xong

```
1. Login
2. + Tạo bài mới (chọn domain: engineering / soft-skills)
3. Nhập chủ đề (hoặc để trống)
4. Chạy full pipeline (4 bước):
   - Research      → Tavily search + Research Brief
   - Insight Gate  → L2+ mới viết tiếp
   - Write         → Bài 12 phần
   - Finalize      → Fact-check + Bản sạch để đăng
5. Xem tab "Bản sạch" → Duyệt (Approve) → Publish nội bộ
```

**Lưu ý AI-TFES:** Luôn có người duyệt trước khi coi là đăng chính thức.

---

## 8. Pipeline & timeout Vercel

| Plan Vercel | Timeout/route | Gợi ý |
|-------------|---------------|-------|
| Hobby | ~60 giây | Dùng **Chạy 1 bước** từng bước |
| Pro | ~300 giây | Có thể **Chạy full pipeline** |

Route `POST /api/articles/[id]/actions` set `maxDuration = 60` (Hobby). Research tách 2 phase (Tavily rồi GLM).

Mỗi bài ≈ 3 Tavily query + 4 lần gọi GLM-5.2 → có thể mất **5–15 phút** end-to-end.

---

## 9. Lấy API keys chi tiết

### NVIDIA (GLM-5.2)

1. [build.nvidia.com](https://build.nvidia.com) hoặc NVIDIA API portal
2. Generate API Key → `nvapi-...`
3. Model khi gọi: `z-ai/glm-5.2`
4. Base URL: `https://integrate.api.nvidia.com/v1`

### Tavily (Web search)

1. [tavily.com](https://tavily.com) → Sign up
2. Dashboard → **API Keys** → Create
3. Copy `tvly-...`
4. Free tier: ~1.000 search/tháng (~330 bài nếu 3 query/bài)

---

## 10. Xử lý lỗi thường gặp

| Lỗi | Nguyên nhân | Cách xử lý |
|-----|-------------|------------|
| `TAVILY_API_KEY chưa được cấu hình` | Thiếu env Tavily | Thêm trên Vercel → Redeploy |
| `NVIDIA API lỗi 401` | Key sai/hết hạn | Kiểm tra `NVIDIA_API_KEY` |
| `DATABASE_URL is not set` | Thiếu DB env | Tạo Neon + thêm biến |
| `Can't reach database server` | Neon sleep / URL sai | Thử lại sau 2s; kiểm tra `?sslmode=require` |
| Pipeline timeout | Hobby plan 60s | Chạy **1 bước** thay vì full |
| Insight Gate FAILED | Chủ đề chưa đạt L2 | Đổi chủ đề, tạo bài mới |
| `content/ai-tfes chưa có` | Chưa sync prompt | `node scripts/sync-tfes.mjs` |

---

## 11. Scripts hữu ích

```bash
cd web

# Sync prompt AI-TFES vào web/content/ai-tfes
node scripts/sync-tfes.mjs

# Cập nhật schema DB
npx prisma db push

# Xem DB (GUI)
npx prisma studio

# Build production local
npm run build
npm start
```

---

## 12. Bảo mật (MVP nội bộ)

- Chỉ 1 admin — đặt `ADMIN_PASSWORD` mạnh
- Không commit `.env`
- Website protected bởi middleware — mọi route (trừ `/login`) cần session
- API keys chỉ ở server-side (Vercel env), không expose ra frontend

---

## 13. Tài liệu liên quan

| File | Nội dung |
|------|----------|
| `web/README.md` | Tóm tắt nhanh |
| `web/.env.example` | Mẫu biến môi trường |
| `AI-TFES/00-README.md` | Hệ thống AI-TFES gốc |
| `AI-TFES/BAN-GIAO-AI-TFES.md` | Quy ước vận hành editorial |

---

## 14. Checklist hoàn tất cấu hình

- [ ] `DATABASE_URL` — Neon Postgres
- [ ] `npx prisma db push` — schema OK
- [ ] `ADMIN_PASSWORD` + `SESSION_SECRET`
- [ ] `NVIDIA_API_KEY` + model `z-ai/glm-5.2`
- [ ] `TAVILY_API_KEY`
- [ ] Vercel Root Directory = `web`
- [ ] Deploy thành công
- [ ] Login OK
- [ ] Chạy thử 1 bài end-to-end

---

*Cập nhật: MVP — GLM-5.2 · Tavily · Vercel · Neon free tier*
