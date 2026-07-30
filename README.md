# ContentTechhub / ContentWrite

Monorepo biên tập AI-TFES:

| Thư mục | Vai trò |
|---------|---------|
| `AI-TFES/` | Prompt & template gốc |
| `web/` | Next.js app (deploy Vercel, Root Directory = `web`) |

## Deploy Vercel nhanh

1. Import `https://github.com/liemch/contentwrite.git`
2. **Root Directory = `web`** (Settings → Build and Deployment) — bắt buộc, không bỏ qua
3. Thêm env (xem `web/.env.example`)
4. Deploy → khi status **Ready**, mở URL trong tab Deployments
5. Sync schema: `cd web && npx prisma db push` (trỏ `DATABASE_URL` production)

Nếu thấy `404 NOT_FOUND` / `DEPLOYMENT_NOT_FOUND`: project chưa deploy thành công hoặc Root Directory chưa phải `web`.
