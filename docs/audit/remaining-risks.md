# Remaining Risks after WP2

> Cập nhật: 2026-08-06  
> Nguồn: [post-wp2-assessment.md](./post-wp2-assessment.md)

## P0 — Phải xử lý trước khi mở rộng user

| ID | Cải tiến | Vấn đề giải quyết | Giá trị | Effort | Rủi ro | Điều kiện thực hiện | Ưu tiên |
|---|---|---|---|---|---|---|---|
| OPS-1 | Xác minh production migration + schema drift | Không có bằng chứng `_prisma_migrations`/Series column khớp code | Tránh outage/data inconsistency sau deploy | S | Chạy resolve sai có thể làm history sai | Snapshot trước; `migrate status`; kiểm schema; lưu evidence | P0 |
| OPS-2 | Xác minh backup và thử restore tối thiểu | Rollback DB hiện phụ thuộc snapshot chưa được drill | Giảm nguy cơ mất dữ liệu/MTTR | M | Restore nhầm production | Dùng Neon branch/staging; không thử trực tiếp trên prod | P0 |
| PREVIEW-1 | Tách Preview DB hoặc chặn toàn bộ mutation | Preview vẫn có thể CRUD/publish vào production DB | Ngăn hỏng/lộ dữ liệu thật từ PR deployment | S–M | Preview test mất write capability | Biết cấu hình Vercel env scopes; ưu tiên Neon branch riêng | P0 |
| SERIES-1 | Ẩn toàn bộ draft row không accessible trong Series GET | Sanitizer chỉ null body, vẫn lộ title/topic/status | Đóng cross-user metadata leak | S | Có thể thay đổi UX series chung | Giữ published metadata; filter draft theo owner/admin | P0 |
| SERIES-2 | Kiểm ownership khi gắn Article vào Series | Editor có thể gắn bài mình vào Series người khác | Ngăn integrity/ordering pollution | S | Legacy null Series cần admin policy | `canAccessSeries()` + route test | P0 |
| AUTO-1 | Chọn policy rõ cho auto-write hiện tại | Daily cron chạy một step rồi không resume sau 60s | Tránh tính năng “auto” thường xuyên kẹt | S | User tin bài sẽ tự hoàn tất | Trước mở rộng: disable/label manual hoặc làm minimal WP3 | P0 |

P0 không bao gồm queue/microservice. Mục tiêu là chứng minh vận hành hiện tại và không quảng bá hành vi hệ thống chưa thực hiện được.

## P1 — Nên làm trong phiên bản tiếp theo

| ID | Cải tiến | Vấn đề giải quyết | Giá trị | Effort | Rủi ro | Điều kiện thực hiện | Ưu tiên |
|---|---|---|---|---|---|---|---|
| SEC-DEP-1 | Nâng dependency có 4 High advisories | `npm audit` fail ở fast-uri, PostCSS, sharp/Next | Giảm exposure đã biết | S–M | Next upgrade có regression | Upgrade có kiểm soát; full CI + Vercel smoke | P1 |
| TEST-1 | Route integration tests cho auth/ownership | Helper tests không chứng minh route wiring/Prisma query | Chặn IDOR/session regression thật | M | Mock quá sâu tạo test giả | Test route với DB test hoặc adapter mock nhất quán | P1 |
| TEST-2 | State-machine/workflow recovery tests | Core 2.9k LOC không có test | Bảo vệ giá trị lõi và retry/revision logic | M–L | Fixture phức tạp | Bắt đầu 5–8 transition critical, không snapshot toàn pipeline | P1 |
| OBS-1 | Error tracking + structured correlation IDs | Không biết rate lỗi, timeout, route/step thất bại | Phát hiện incident và quyết định WP3 bằng dữ liệu | M | Log PII/prompt | Redact secrets/content; log articleId/runId/state/timing | P1 |
| REL-1 | Minimal WP3 continuation policy | Cron/client loop không đáng tin | Auto-write thực sự hoàn tất hoặc fail rõ | M | Dễ vượt Vercel limit/quota | Có metric step duration; giữ one-step transaction/idempotency | P1 |
| ENV-1 | Sửa bootstrap admin env contract | Thiếu `ADMIN_PASSWORD` làm mọi login 500 dù DB đã seed | Tránh outage do config/document mismatch | S | Thay đổi bootstrap behavior | Test DB empty vs existing; document rõ | P1 |
| CI-1 | Lint baseline không nuốt warning; lint scripts | `--max-warnings 20`, `scripts/**` ignored | Chặn regression mới | S | 11 warning hiện tại làm CI đỏ | Baseline allowlist hoặc fix dần; scripts dùng Node ESLint config | P1 |
| DOC-1 | Xóa hướng dẫn production `db push` cũ | README/setup/architecture mâu thuẫn WP1 runbook | Ngăn operator tạo drift mới | S | Thay docs sai có thể làm mất local bootstrap path | Link migration strategy; ghi rõ local-only nếu giữ command | P1 |
| UX-1 | Guided workflow + giải thích “vì sao đang dừng” | Người mới gặp nhiều state/gate/retry | Tăng activation và giảm support | M | UI thêm nhiễu | Phỏng vấn/quan sát 3–5 editor | P1 |
| DATA-1 | Product/workflow metrics tối thiểu | Chưa biết TFES tăng chất lượng/thời gian | Chứng minh moat và ưu tiên roadmap | M | Thu thập quá nhiều content | Chỉ aggregate: duration, attempts, completion, score, cost | P1 |

## P2 — Làm khi số người dùng tăng

| ID | Cải tiến | Vấn đề giải quyết | Giá trị | Effort | Rủi ro | Điều kiện thực hiện | Ưu tiên |
|---|---|---|---|---|---|---|---|
| SCALE-1 | Distributed login rate limit | In-memory Map per serverless instance | Abuse protection nhất quán | M | Thêm external dependency | Khi login volume/abuse tăng hoặc public launch | P2 |
| SCALE-2 | Job lease/queue cho AI workflow | Concurrent requests, retries, timeout | Reliable background execution | L–XL | Over-engineering sớm | Khi >20 concurrent jobs/ngày hoặc timeout data xác nhận |
| SCALE-3 | AI concurrency/quota budget | Nhiều user gọi NVIDIA/Tavily đồng thời | Kiểm soát cost và 429 | M | Giảm throughput | Có usage/cost metrics và quota policy |
| PERF-1 | Pagination/payload trim | List API/SSR có thể tải nhiều row/content | Giảm latency/memory | M | UX pagination | Đo p95 hoặc dataset tăng rõ |
| PERF-2 | Index/query tuning | N+1/full scans tĩnh đã ghi nhận | Giảm DB load | M | Index write overhead | EXPLAIN/slow query evidence |
| DATA-2 | Artifact/transition retention | Append-only audit tăng vô hạn | Kiểm soát storage | M | Mất audit/history | Có growth rate, compliance requirement |
| CACHE-1 | Shared cache nếu cần | Module cache không shared | Consistency/performance | M | Stale data/infra | Chỉ khi DB/read metrics chứng minh |

## P3 — Có thể trì hoãn

| ID | Cải tiến | Vấn đề giải quyết | Giá trị | Effort | Rủi ro | Điều kiện thực hiện | Ưu tiên |
|---|---|---|---|---|---|---|---|
| REF-1 | Split `workflow.ts` | God file khó bảo trì | Dev velocity dài hạn | L | Refactor core gây regression | Sau TEST-2; behavior-preserving |
| REF-2 | Loại dual state/projection | `workflowState` + status/currentStep | Giảm cognitive load | L | Data/UI compatibility | Khi có migration/test đầy đủ |
| REF-3 | Chuẩn hóa parser/retry/error helpers | Duplication/scattered config | Code consistency | M | Ít user value trực tiếp | Làm cùng feature liên quan |
| ARCH-1 | Tách worker/service | Modular monolith bị giới hạn long job | Scale độc lập | XL | Infra/ops tăng mạnh | Chỉ khi threshold roadmap được đo |
| ARCH-2 | Enterprise patterns | Không có nhu cầu hiện tại | Thấp | XL | Lãng phí | Không làm nếu chưa có evidence |

## Top 5 rủi ro còn lại

1. Production schema/migration/backup chưa có bằng chứng kiểm chứng.
2. Series còn draft metadata leak và cross-owner assignment integrity gap.
3. Preview có thể ghi production database nếu env scopes cấu hình sai.
4. Auto-write không tự hoàn tất với daily single-step cron.
5. Core workflow thiếu tests/observability; 4 High dependency advisories chưa triage.

## Rủi ro được chấp nhận tạm thời

- `SameSite=Lax` không CSRF token: chấp nhận cho app nội bộ, xem lại khi có third-party embed/public API.
- In-memory login limiter: partial defense, không gọi là distributed protection.
- Module cache trong TFES docs: optimization per instance, DB vẫn là source.
- Client-only page shell có thể hiện trước khi API 401: không phải data leak nếu API tiếp tục enforce.
- Legacy JWT thiếu `sv`: DB active/role vẫn dùng; residual hết theo TTL 7 ngày.
