# ContentTechhub / ContentWrite

Monorepo biên tập AI-TFES:

| Thư mục | Vai trò |
|---------|---------|
| `AI-TFES/` | Prompt & template gốc |
| `web/` | Next.js app (deploy Vercel, Root Directory = `web`) |

## Deploy Vercel nhanh

1. Import `https://github.com/liemch/contentwrite.git`
2. **Root Directory** = `web`
3. Thêm env (xem `web/.env.example` + `web/HUONG-DAN-CAU-HINH.md`)
4. Postgres (`DATABASE_URL`) → sau deploy chạy `npx prisma db push`

Chi tiết: [`web/HUONG-DAN-CAU-HINH.md`](./web/HUONG-DAN-CAU-HINH.md)
