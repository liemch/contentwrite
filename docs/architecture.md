# Kiến trúc liemch2 (ContentWrite / ContentTechhub)

> Tài liệu mô tả kiến trúc hệ thống đang vận hành.  
> Cập nhật: 2026-08-06 — đã xác nhận với maintainer.

---

## 1. Kiến trúc tổng thể

Monorepo **2 phần**, **1 service deploy**:

```
┌─────────────────────────────────────────────────────────────┐
│                      liemch2 (monorepo)                      │
├──────────────────────┬──────────────────────────────────────┤
│     AI-TFES/         │              web/                     │
│  (content/prompts)   │   Next.js 16 App Router (deployable)   │
│  không chạy runtime  │   Prisma + PostgreSQL + Vercel        │
└──────────┬───────────┴──────────────────┬───────────────────┘
           │  prebuild: sync-tfes.mjs     │
           └──────────────────────────────► web/content/ai-tfes/
                                              (+ override DB nếu có)
```

| Khía cạnh | Thiết kế |
|-----------|----------|
| **Mục đích** | Hệ thống biên tập nội dung AI (AI-TFES): nghiên cứu → insight → draft → review → fact-check → publish |
| **Deploy** | Vercel, `rootDirectory: web` (file `vercel.json` ở root repo) |
| **Auth** | JWT cookie (`jose`), middleware bảo vệ hầu hết route |
| **AI** | LLM qua NVIDIA API (`nvidia.ts`), web search qua Tavily (`search.ts`) |
| **State** | Workflow canonical AI-TFES v1.6 + projection legacy 4 bước UI |

**Nguyên tắc:** `AI-TFES/` là nguồn prompt/template; `web/` là runtime duy nhất. Build copy nội dung sang `web/content/ai-tfes/`; admin có thể ghi đè qua DB (`TfesDocument`).

---

## 2. Các module chính

### 2.1 Editorial engine — `web/src/lib/tfes/`

Trái tim nghiệp vụ:

| Module | Vai trò |
|--------|---------|
| `workflow.ts` | Orchestrator: chạy từng bước pipeline, human ack, approve, publish |
| `state-machine.ts` | Chuyển trạng thái atomic, optimistic lock (`workflowVersion`) |
| `parser.ts` | Parse output AI (marks, scores, machine lines) |
| `prompts.ts` | Ghép system prompt + bước pipeline |
| `contract.ts`, `pipeline-config.ts`, `retry-policy.ts` | Ngưỡng chất lượng, version, giới hạn retry |
| `quality.ts`, `engineering-gold-bar.ts`, `editorial-review-gate.ts` | Gate chất lượng (review, gold bar, final verification) |
| `fact-ledger.ts`, `human-review.ts` | Fact-check + human review |
| `editorial-memory.ts` | Bài mẫu / hint từ bài đã publish tốt |
| `article-shape-manager.ts`, `article-shapes.ts` | Cấu trúc bài (shape) theo domain |
| `domains.ts`, `domain-profile.ts`, `tfes-docs.ts` | Domain profile + override tài liệu TFES |
| `digest.ts`, `series.ts`, `publish-formats.ts` | Digest, chuỗi bài, format xuất bản |
| `final-verification.ts`, `desk-state.ts`, `tracker.ts` | Bước 9b, desk JSON, theo dõi run |

### 2.2 Auto-write — `web/src/lib/auto-write/`

Tự động tạo/chạy bài theo lịch: chọn seed topic → tạo article → tick pipeline. Cron Vercel gọi `/api/cron/auto-write` (02:00 UTC).

### 2.3 Image — `web/src/lib/image/`

Hero image, gallery, prompt gợi ý brief ảnh cho bài.

### 2.4 Hạ tầng — `web/src/lib/`

| File / thư mục | Vai trò |
|----------------|---------|
| `db.ts` | Prisma client |
| `auth-cookie.ts`, `access.ts` | Session + phân quyền |
| `nvidia.ts`, `search.ts`, `http-client.ts` | LLM + Tavily + HTTP |
| `publish-content.ts`, `excerpt.ts`, `brand.ts` | Nội dung reader-facing |

### 2.5 UI — `web/src/app/` + `web/src/components/`

**Pages:** dashboard, articles (new + detail), library, series, digests, settings, login.

**Components đáng chú ý:** `pipeline-run-panel`, `pipeline-steps`, `pipeline-queue`, `human-review-gate`, `approve-gate`, `fact-ledger-panel`, `editorial-summary-panel`, `article-image-studio`, `tfes-docs-editor`, `users-admin-panel`.

**API (Route Handlers):** articles CRUD + workflow/actions, auth, users, series, digests, settings (auto-write, article-shapes, tfes-docs), editorial-memory, cron auto-write, health (integrations, tavily).

---

## 3. Vai trò từng thư mục

```
liemch2/
├── AI-TFES/                 # Nguồn prompt/template (authoring, không runtime)
│   ├── 00-README.md
│   ├── 01-Standard/         # Chuẩn thiết kế (reference)
│   ├── 02-Prompts/          # Operating prompt AI đọc mỗi lần chạy
│   ├── 04-Domain-Profiles/  # Profile theo domain (engineering, security, …)
│   └── 05-Templates/        # Template output (Article, Review, FactCheck, …)
│
├── web/                     # App deploy (Next.js)
│   ├── content/ai-tfes/     # Bản copy build-time từ AI-TFES
│   ├── prisma/              # schema.prisma, migrations, SQL patches
│   ├── scripts/             # sync-tfes, seed-admin, DB helpers
│   ├── src/
│   │   ├── app/             # App Router: pages + API
│   │   ├── components/      # React UI
│   │   ├── lib/             # Business logic
│   │   └── middleware.ts    # Auth gate
│   ├── public/              # Static assets
│   └── vercel.json          # Region (sin1), cron
│
├── docs/                    # Tài liệu dự án (file này)
├── vercel.json              # rootDirectory → web
└── README.md                # Hướng dẫn deploy
```

---

## 4. Luồng dữ liệu

### 4.1 Luồng nội dung TFES (build)

```
AI-TFES/  ──sync-tfes.mjs (prebuild)──►  web/content/ai-tfes/
                                              │
                    TfesDocument (DB, optional override)
                                              │
                                              ▼
                              hydrateTfesOverrides() lúc runtime
```

### 4.2 Luồng bài viết (runtime)

**Trạng thái canonical (rút gọn):**

```
IDEA → RESEARCHED → SYNTHESIZED → INSIGHT_APPROVED → DECIDED → PLANNED
  → DRAFTED → EDITORIAL_REVIEWED → FACT_CHECKED → FINAL_REVIEWED
  → POLISHED → READER_SIMULATED → PUBLISH_READY → APPROVED → PUBLISHED
```

Có nhánh lỗi/revision: `RESEARCH_REQUIRED`, `*_REVISION_REQUIRED`, `FACT_CHECK_FAILED`, `READER_SIMULATION_FAILED`, và post-publish `CORRECTION_REQUIRED` / `RETRACTED`.

**UI legacy (4 bước):** RESEARCH → INSIGHT → WRITE → FINALIZE (map từ canonical state).

**Một vòng `runWorkflowStep(articleId)`:**

1. Load article + hydrate TFES overrides + bootstrap legacy state
2. Gọi Tavily (research, ≥3 URL) → LLM → artifact `Research Brief`
3. Insight gate → quyết định → planning
4. Draft + quality gates
5. Finalize: editorial review → **pause human review** → fact-check → final verification (9b) → clean publish → polish → reader sim → `PUBLISH_READY`
6. Human: `approveArticle()` → `APPROVED` → `publishArticle()` → `PUBLISHED`

**Lưu trữ trên Article:**

- Cột markdown/JSON: `researchBrief`, `insightGate`, `draft12`, `factCheck`, `cleanPublish`, `deskJson`, hero/gallery, …
- Append-only: `WorkflowArtifact`, `WorkflowTransition` (audit)
- Sau publish: `KnowledgeRecord`; bài điểm cao có thể vào editorial memory

**Auto-write:**

```
Cron (02:00 UTC) → /api/cron/auto-write → runner chọn seed → tạo Article
  → runWorkflowStep lặp cho đến gate human hoặc terminal
```

### 4.3 Luồng request HTTP

```
Browser → middleware.ts (JWT, trừ /login, auth API, health, cron)
       → Page (RSC/Client) hoặc API route
       → lib/* (workflow, db, nvidia, search)
       → PostgreSQL (Prisma)
```

**Route public (không cần JWT):** `/login`, `/api/auth/login`, `/api/health/integrations`, `/api/cron/auto-write`.

---

## 5. Công nghệ đang sử dụng

| Lớp | Công nghệ |
|-----|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Ngôn ngữ | TypeScript 5 |
| DB | PostgreSQL + Prisma 7 (`@prisma/adapter-pg`, driver `pg`) |
| Auth | `jose` (JWT), `bcryptjs` (hash password) |
| AI | OpenAI-compatible SDK → NVIDIA endpoint; Tavily search |
| Markdown UI | `react-markdown` + `remark-gfm` |
| Deploy | Vercel (region Singapore `sin1`) |
| Env | `dotenv`, biến trong `web/.env.example` |

**Build pipeline:** `prebuild` sync TFES → `prisma generate` + `db push` → `next build`.

---

## 6. Thư viện quan trọng

### Runtime (`dependencies`)

| Thư viện | Mục đích |
|----------|----------|
| `next`, `react`, `react-dom` | App framework + UI |
| `@prisma/client`, `@prisma/adapter-pg`, `pg` | ORM + PostgreSQL |
| `jose` | JWT session |
| `bcryptjs` | Password admin |
| `openai` | Client gọi LLM (NVIDIA) |
| `react-markdown`, `remark-gfm` | Render markdown pipeline/output |
| `dotenv` | Env local/dev |

### Dev (`devDependencies`)

| Thư viện | Mục đích |
|----------|----------|
| `prisma` | CLI + schema codegen |
| `typescript` | Type checking |
| `tailwindcss`, `@tailwindcss/postcss` | Styling |
| `eslint`, `eslint-config-next` | Lint |

---

## 7. Tóm tắt đã xác nhận

1. **`AI-TFES/`** — kho prompt, chuẩn, domain profile, template; không phải service.
2. **`web/`** — app Next.js duy nhất deploy lên Vercel; PostgreSQL qua Prisma.
3. **Build** copy `AI-TFES` → `web/content/ai-tfes/`; runtime có thể override qua DB.
4. **Core logic** nằm ở `web/src/lib/tfes/` — state machine + workflow orchestrate pipeline ~15 bước canonical, có human gate và fact-check.
5. **UI** quản lý article, chạy pipeline, review human, approve/publish; **API** phục vụ CRUD + workflow actions + cron auto-write.
6. **Tích hợp ngoài:** NVIDIA (LLM), Tavily (search), Vercel (host + cron).
7. **Auth:** JWT cookie; middleware chặn mọi route trừ login, health, cron.

---

## 8. Tham chiếu nhanh

| Câu hỏi | Nơi xem |
|---------|---------|
| Deploy Vercel | `README.md`, `vercel.json` |
| Cấu hình env | `web/.env.example`, `web/HUONG-DAN-CAU-HINH.md` |
| Chuẩn AI-TFES | `AI-TFES/00-README.md`, `AI-TFES/01-Standard/` |
| State machine | `AI-TFES/05-Templates/Workflow-State-Machine.md`, `web/src/lib/tfes/state-machine.ts` |
| Sync content build | `web/scripts/sync-tfes.mjs` |
