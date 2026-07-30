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

1. Import repo, **Root Directory** = `web`
2. Thêm Postgres (Vercel Storage / Neon) → `DATABASE_URL`
3. Environment Variables (xem `.env.example`)
4. Deploy → chạy migration:

```bash
cd web && npx prisma db push
```

## Pipeline API

Mỗi bước gọi `POST /api/articles/:id/actions` body `{ "action": "run-step" }` để tránh timeout Vercel (max 300s/route trên Pro).

Model mặc định: `z-ai/glm-5.2` @ `https://integrate.api.nvidia.com/v1`
