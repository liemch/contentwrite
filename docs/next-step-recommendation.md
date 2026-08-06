# Next-step Recommendation after WP2

> Cập nhật: 2026-08-06  
> Inputs: [post-WP2 assessment](./audit/post-wp2-assessment.md), [remaining risks](./audit/remaining-risks.md)

## WP3 — đánh giá khách quan

### 1. Auto-write có hoạt động end-to-end trên Vercel?

**Manual run có thể tiến end-to-end; production cron hiện không.**

- `tickAutoWrite()` chỉ chạy một workflow step mỗi lần gọi (`runner.ts:340-446`).
- Nếu chưa xong, nó đặt `nextRunAt = now + 60s` (`runner.ts:450-458`).
- Vercel Cron chỉ gọi `0 2 * * *` mỗi ngày (`web/vercel.json`).
- `AutoWriteWatcher` là no-op (`components/auto-write-watcher.tsx:1-9`).
- Settings “Chạy ngay” loop tối đa 24 requests phía client (`settings/page.tsx:316-390`).

Do đó tên “auto-write” vượt quá capability cron hiện tại: không có scheduler gọi lại sau 60 giây.

### 2. Workflow có thể kẹt khi nào?

- Step NVIDIA/Tavily vượt function timeout hoặc upstream 429/5xx.
- Cron hoàn thành một step nhưng không có invocation tiếp theo.
- Client đóng tab/mất mạng giữa vòng 24 calls.
- Bài đến human review state và cần editor xác nhận — đây là pause có chủ đích.
- State/error không nằm trong `AUTO_RUNNABLE_STATES`.
- Pending review đạt `maxPendingReview`.
- Hai invocation concurrent cùng chọn một draft; optimistic workflow version giảm rủi ro nhưng chưa có job lease cho scheduler.

### 3. Cron có khớp `nextRunAt`/resume?

**Không.** Logic `isDue(nextRunAt)` đúng ở mỗi invocation, nhưng cron daily không thể honor mốc +45s/+60s. `nextRunAt` hiện là intent không có scheduler tương ứng.

### 4. Có phụ thuộc client loop?

**Có.** Manual auto-write và “cả chu trình” article chạy nhiều HTTP requests từ browser (`settings/page.tsx:332-390`; `articles/[id]/page.tsx:620-684`).

### 5. Route dễ timeout

- `/api/articles/[id]/actions`: 300s
- `/api/cron/auto-write`: 300s
- `/api/auto-write/run`, `/tick`: 300s
- Hero: 180s
- Suggest seeds: 120s

`maxDuration` không đảm bảo plan Vercel cho phép full duration; NVIDIA timeout mặc định 240s.

### 6–7. Sửa nhỏ hay cần worker?

**Sửa nhỏ đủ cho giai đoạn hiện tại**, nếu mục tiêu là reliability cho ít job:

- Chọn một continuation mechanism phù hợp plan Vercel.
- Giữ one-step-per-invocation và optimistic transition.
- Thêm job/run identity, lease đơn giản trong DB hoặc compare-and-swap để chống trùng.
- Metrics + alert khi draft auto không tiến trong N phút/giờ.

Chưa cần worker riêng. Chỉ xem xét queue/worker khi metrics cho thấy timeout/concurrency thực sự và auto-write có user value.

### 8–9. Làm WP3 ngay?

**Không làm full WP3 theo roadmap cũ ngay.** Trước hết:

1. Nếu auto-write là promise production: làm **Minimal WP3** ngay.
2. Nếu auto-write chỉ tiện ích ít dùng: disable/đổi label thành “manual assisted run”, thu feedback trước.

Không làm gì có rủi ro cụ thể: user nghĩ cron sẽ tạo bài hoàn chỉnh nhưng thực tế mỗi ngày chỉ tiến một step; draft treo, quota/cost khó đoán, không có alert.

### 10. Phạm vi WP3 nhỏ nhất có giá trị

1. Định nghĩa SLA: một auto article phải tiến hoặc báo lỗi trong bao lâu.
2. Persist `runId`, lease/claimedAt hoặc dùng workflow CAS để chỉ một invocation tiến bài.
3. Scheduler continuation phù hợp Vercel plan; không loop vô hạn trong một request.
4. Hard time budget cho mỗi invocation; trả state rõ.
5. Metrics: step duration, timeout, retry, stale draft, cost proxy.
6. Alert/admin UI cho draft stale và nút resume an toàn.
7. 5–8 tests cho due/resume/concurrency/error schedule.

## Ba phương án

### Phương án A — Tiếp tục hardening kỹ thuật

**Việc làm**

- Production migration/backup verification.
- Preview DB isolation.
- Upgrade dependency advisories.
- Route/workflow tests và monitoring.
- Minimal WP3.

**Lợi ích:** giảm outage/data leak và tăng khả năng vận hành.  
**Chi phí:** 2–4 tuần solo dev; ít feature nhìn thấy.  
**Chọn khi:** sắp onboard nhiều editor, auto-write là cam kết, hoặc đã có incident.

### Phương án B — Chuyển sang phát triển sản phẩm

**Ưu tiên**

- Guided onboarding / “what happens next”.
- Template + sample workflow ngắn.
- Dashboard thể hiện progress/failure rõ.
- Feedback/rating sau publish và time-to-value metrics.

**Giá trị:** kiểm chứng AI-TFES có giúp user tốt hơn chatbot hay không.  
**Rủi ro chấp nhận:** auto-write manual, monitoring/test còn mỏng; chỉ phù hợp pilot nhỏ.  
**Chọn khi:** production cá nhân ổn, chưa có user demand cho auto-write, cần PMF evidence.

### Phương án C — Xen kẽ sản phẩm và kỹ thuật

**Vòng 1**

1. Kỹ thuật: production DB/backup/Preview assurance + minimal error tracking.
2. Sản phẩm: guided first article + giải thích gate.
3. Đo: completion, time-to-publish, fail state, editor score.

**Vòng 2**

1. Kỹ thuật: xử lý hotspot được metrics chứng minh (có thể là Minimal WP3).
2. Sản phẩm: cải thiện bước gây bỏ cuộc nhiều nhất.
3. Đo lại.

**Khuyến nghị: chọn Phương án C.** WP0–WP2 đã giảm rủi ro nền đủ để pilot; hardening tiếp không dựa usage dễ thành over-engineering. Nhưng chuyển hoàn toàn sang feature khi production migration/Preview/monitoring chưa chứng minh cũng quá mạo hiểm.

## Top 10 hành động tiếp theo

| # | Hành động | Vì sao | Kết quả mong đợi | Effort | Trước deploy? | Cần user feedback? |
|---:|---|---|---|---|---|---|
| 1 | Xác minh production migration + snapshot + smoke | Rủi ro dữ liệu/outage trực tiếp | Evidence schema khớp và rollback có thật | S | **Có, trước mở rộng** | Không |
| 2 | Tách Vercel Preview DB | Ngăn PR ghi production | Preview an toàn để test | S | **Có** | Không |
| 3 | Fix Series draft metadata + cross-owner assignment | Data leak/integrity gap còn lại từ WP0 | Multi-user isolation đúng ở route thật | S | **Có trước thêm user** | Không |
| 4 | Triage/upgrade 4 High dependency advisories | Security debt có evidence | `npm audit` sạch High hoặc có accepted-risk note | S–M | Nên | Không |
| 5 | Thêm error tracking + workflow metrics tối thiểu | Hiện không biết fail ở đâu | Baseline completion/timeout/cost proxy | M | Nên | Không |
| 6 | Route integration tests cho auth/ownership | Helper tests chưa bảo vệ wiring | IDOR/session regressions bị CI chặn | M | Nên trước thêm user | Không |
| 7 | Chốt auto-write: disable/label manual hoặc Minimal WP3 | Promise hiện không đúng cron behavior | Không còn draft “auto” treo im lặng | S–M | Nếu quảng bá auto-write | Có |
| 8 | Guided first-article onboarding | Workflow nhiều state khó học | Time-to-first-publish giảm | M | Không | **Có** |
| 9 | Thu rating + time-to-publish + intervention count | Chưa chứng minh TFES moat | Dữ liệu quyết định product/WP3 | M | Không | **Có** |
| 10 | Workflow state-machine/recovery tests | Core logic không có test | Refactor/bugfix an toàn hơn | M–L | Không | Không |

## Nếu chỉ được làm một việc

Thực hiện **Production Assurance + Measurement slice**: xác minh migration/backup/smoke và bật metrics tối thiểu cho workflow completion/failure. Đây là một outcome vận hành duy nhất, effort nhỏ–vừa, vừa giảm rủi ro ngay vừa cung cấp dữ liệu để quyết định có cần WP3 hay nên tập trung onboarding/product.
