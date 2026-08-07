# WP2.7 — Production Validation & Measurement

**Ngày:** 2026-08-07  
**Trạng thái:** Implemented technically; automated gates and production cohort required  
**Phụ thuộc:** WP2.5, WP2.6  
**Ngoài phạm vi:** WP-E0A, queue/worker, microservice, workflow refactor

## Mục tiêu

Xác minh production đang chạy đúng revision, quan sát từng remediation bằng dữ liệu có cấu trúc,
cho editor recovery an toàn sau exhaustion và thu feedback trước quyết định benchmark.

## Thay đổi

### Deployment identity

- Admin-only `GET /api/health/version`.
- Dùng `VERCEL_GIT_COMMIT_SHA`, fallback `GITHUB_SHA`/`COMMIT_SHA`, cuối cùng `unknown`.
- Settings hiển thị full/short SHA, tier và nguồn metadata; không trả arbitrary env hoặc secret.

### Remediation telemetry

`WorkflowTransition.details.telemetry` dùng contract `wp2.7-v1`:

- article/state/action, attempt/retry/remediation;
- score, decision, machine contract/readability, G1–G8;
- draft length và presence của Takeaways/Discussion/References;
- maxTokens, llmMs, safe failure reason/error class;
- deployment commit.

Serializer chỉ nhận allowlisted fields, giới hạn chiều dài reason và redact secret-like values.
Không lưu prompt hoặc toàn bộ bài trong telemetry. Nội dung draft vẫn chỉ tồn tại ở artifact
revision theo contract workflow cũ.

### Timeline

Article owner hoặc admin dùng API workflow hiện có để xem remediation timeline. UI hiển thị score
delta, gate fail, retry/exhaustion, draft length, latency và phân loại content/parser/runtime.
Authorization không đổi: editor chỉ thấy bài mình; admin thấy tất cả.

### Recovery đã chọn

Chọn **manual `draft12` revision**:

1. Chỉ mở khi revision/fact remediation exhausted.
2. Client gửi `expectedVersion`; server kiểm optimistic lock.
3. Tạo immutable `ARTICLE_DRAFT` revision mới.
4. Xóa Fact/Final/Clean downstream đã mất hiệu lực.
5. Chuyển về `DRAFTED`; `run-step` tiếp theo bắt buộc chạy Editorial Review.
6. Giữ nguyên lifetime remediation history (`countersReset=false`).
7. Mở recovery-cycle budget mới tại transition `manual-draft-revision`
   (`recoveryCycleBudgetReset=true`): lần Editorial Review fail sau recovery được phép
   chạy tối đa 3 remediation mới; lifetime count vẫn tăng để audit.

Không sửa `cleanPublish`, không reset `workflowRunId`, không ghi đè artifact cũ,
không xóa transition lịch sử.

### Editor feedback

Form 1–5 và ghi chú được lưu trong `Article.deskJson.validationFeedback`, kèm `articleId`,
`userId`, timestamp. Chỉ owner/admin đọc và sửa qua article route hiện có. Không tạo survey
platform hoặc public endpoint.

### Metrics report

`npm run db:report:remediation -- ...` gọi script read-only, yêu cầu cohort manifest hoặc date
range rõ ràng, xuất JSON/CSV/Markdown. Script không gọi AI, không ghi DB và không chạy trong CI.

## Data impact

- Không đổi Prisma schema.
- Không có migration.
- Không có env bắt buộc mới.
- `deskJson` nhận optional `validationFeedback`.
- `WorkflowTransition.details` nhận nested object additive `telemetry`.

## Definition of Done kỹ thuật

- [x] Admin xác minh deployment commit.
- [x] Telemetry cấu trúc tại các remediation/gate/retry bắt buộc.
- [x] Timeline article-scoped.
- [x] Manual draft recovery có optimistic lock và immutable artifact.
- [x] Read-only metric report.
- [x] Private feedback form.
- [ ] Toàn bộ automated quality gates pass.
- [ ] Cohort production đạt protocol tối thiểu.

WP2.5/WP2.6 chưa được ghi **validated** cho tới khi cohort hoàn thành.

