# WP2.6 — Final Gate & Parser Reliability

**Ngày:** 2026-08-06  
**Trạng thái:** Implemented; verified by automated tests; needs production validation  
**Phụ thuộc:** WP2.5 F1–F3  
**Phạm vi:** context/token reliability tại 9b và fact remediation; parser Editorial/Human Review

## Mục tiêu

Loại bỏ các false failure còn lại có thể khiến revision remediation tiêu hết ba lượt dù nội dung đã được sửa:

1. Final Verification 9b phải đọc được phần cuối của draft.
2. Fact remediation phải đủ token để trả toàn bộ draft.
3. Editorial Review parser không được suy `REWRITE_REQUIRED` từ enum nằm trong phần giải thích/template.
4. Prompt, template và parser dùng contract machine output nhất quán.
5. Machine gate và Human Review hiểu checklist Markdown theo cùng một cách.

## Implemented

### Final Verification 9b

- Thay cửa sổ cố định `7_000` bằng `reviewDraftClipChars(article.targetWordCount)`.
- Bước 8, revision remediation và 9b dùng chung policy:
  - minimum `16_000` ký tự;
  - dynamic `targetWordCount × 9`;
  - maximum `32_000` ký tự.
- Không thay đổi ngưỡng hoặc tiêu chí Final Verification.

### Fact remediation

- Xác nhận prompt `finalize-fact-remediate` yêu cầu xuất **toàn bộ bản nháp Markdown đã sửa**.
- Thay `maxTokens: 5200` bằng `cleanGenMaxTokens(article.targetWordCount)`.
- Giữ nguyên model, temperature, prompt và retry policy.

### Editorial Review machine parser

Canonical contract:

```text
PROVISIONAL_TOTAL_SCORE: <0-100>
PROVISIONAL_INSIGHT_SCORE: <0-30>
GATES_G1_G8: <PASSED|FAILED>
EDITORIAL_DECISION: <EDITORIAL_REVIEWED|MINOR_REVISION_REQUIRED|MAJOR_REVISION_REQUIRED|REWRITE_REQUIRED>
```

- Chỉ đọc machine line có key/prefix chính xác và toàn bộ value hợp lệ.
- Không còn quét enum trên toàn văn.
- Output thiếu/malformed trả `machineReadable=false`, `machineContract=invalid`,
  failure reason rõ ràng và state an toàn `MINOR_REVISION_REQUIRED`.
- Không silently PASS; không tự nâng thành REWRITE.
- Production output legacy `FINAL_*` vẫn được hỗ trợ khi là một block legacy đầy đủ; parser không trộn field canonical và legacy.

### Prompt/template contract

- `finalize-review` là nơi duy nhất khai báo block `PROVISIONAL_*`.
- `finalize-verify` là nơi duy nhất khai báo block `FINAL_*`.
- `Review.md` chỉ định dùng block do prompt của phase cung cấp, không khai báo lại key.
- Không tạo format thứ ba.

### Checklist và Human Review parser

- Thêm shared parser `editorial-checklist.ts`.
- Hỗ trợ checklist bullet và Markdown table.
- Bỏ header, separator và PASS row.
- Deduplicate theo gate code.
- `countEditorialGateFails()` và `parseEditorialFindings()` dùng cùng kết quả gate parser.
- Human Review không còn biến `| Tiêu chí | Pass/Fail | Ghi chú |` thành finding.

## Verified by test

- `editorial-review-gate.test.ts`: canonical/legacy/malformed contracts; enum trong template; bảng/bullet/dedup.
- `human-review.test.ts`: header/separator/PASS; FAIL hợp lệ; parity với machine gate; malformed input.
- `review-context.test.ts`: cửa sổ cuối draft và token budget trên toàn dải target.
- `workflow-wiring.test.ts`: source-level assertions cho bước 8, 9b, revision remediation, fact remediation và prompt/template contract.

Kết quả gate tại thời điểm implement:

| Gate | Kết quả |
|---|---|
| `npm run test` | **Pass** — 8 files, 60 tests |
| `npm run typecheck` | **Pass** |
| `npm run lint` | **Pass** — 0 errors, 11 baseline warnings ngoài phạm vi |
| `npm run db:validate` | **Pass** — schema valid, không chạy migration |
| `npm run build` | **Pass** — production build hoàn tất; không gọi DB/AI service |

Test được chạy lại sau `prebuild` sync canonical `AI-TFES/` và vẫn **60/60 pass**.

## Deferred

Ngoài phạm vi WP2.6:

- F7: tách retry budget giữa Editorial Review, pre-9b và 9b.
- F8: mở lại Human Review/reset remediation counter.
- Sửa tay `draft12`.
- Dedicated retry orchestration cho malformed Editorial Review output.
- Queue/worker, WP3, auto-write và cron.

## Needs production validation

Sau deploy, chọn một bài từng bị exhausted và kiểm tra read-only:

1. `editorial-review-after-revision.details.machineReadable` và `machineContract`.
2. 9b có nhìn thấy References/Takeaways/Discussion trong prompt trace (không log nội dung nhạy cảm).
3. Draft artifact sau `remediate-fact-check` không bị cụt phần cuối.
4. Số transition `remediate-required-revision` trước khi pass.
5. `llmMs` của fact remediation và 9b để phát hiện latency tăng.

Không cần gọi AI trong CI; validation production chỉ chạy trên workflow bài thật có chủ đích.

