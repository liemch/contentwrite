# ContentTechhub Web

Website nội bộ viết bài theo **AI-TFES**, dùng **GLM-5.2** qua NVIDIA NIM.

> **Hướng dẫn cấu hình đầy đủ:** xem [`HUONG-DAN-CAU-HINH.md`](./HUONG-DAN-CAU-HINH.md)

## Tính năng MVP

- Đăng nhập 1 admin (`ADMIN_PASSWORD`)
- Tạo bài → pipeline 4 bước: Research → Insight Gate → Write → Finalize
- Web search qua Tavily (bắt buộc)
- Xem 6 khối output + cổng duyệt → Publish nội bộ
- Editorial memory (`KnowledgeRecord`) chống trùng chủ đề

## Chạy local

```bash
cd web
cp .env.example .env
# Điền DATABASE_URL, NVIDIA_API_KEY, TAVILY_API_KEY, ADMIN_PASSWORD

npm install
npx prisma db push
npm run dev
```

Mở http://localhost:3000

## Deploy Vercel

Lỗi `404 NOT_FOUND` / `DEPLOYMENT_NOT_FOUND` = **chưa có deployment thành công** (thường quên Root Directory).

1. Import repo `liemch/contentwrite` trên Vercel
2. **Bắt buộc:** Settings → Build and Deployment → **Root Directory** = `web` → Save
3. Environment Variables (Production + Preview):

| Biến | Bắt buộc |
|------|:--------:|
| `DATABASE_URL` | ✅ Neon/Postgres |
| `ADMIN_PASSWORD` | ✅ |
| `SESSION_SECRET` | ✅ (≥32 ký tự) |
| `NVIDIA_API_KEY` | ✅ |
| `TAVILY_API_KEY` | ✅ |
| `CRON_SECRET` | ✅ (auto-write) |
| `FAL_KEY` | Tuỳ chọn |

4. **Deployments** → Redeploy (hoặc push commit mới)
5. Sau khi deploy xanh: sync DB

```bash
cd web && DATABASE_URL='<production-url>' npx prisma db push
```

URL đúng nằm trong tab **Deployments** (không đoán `*.vercel.app`).

## Pipeline API

Mỗi bước gọi `POST /api/articles/:id/actions` body `{ "action": "run-step" }` để tránh timeout Vercel (max 300s/route trên Pro).

Model mặc định: `z-ai/glm-5.2` @ `https://integrate.api.nvidia.com/v1`
