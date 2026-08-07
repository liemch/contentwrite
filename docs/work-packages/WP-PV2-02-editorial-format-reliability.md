# WP-PV2-02 — Editorial Format Reliability

**Trạng thái:** Done — không cần flag mới
**Phụ thuộc:** WP-PV2-01 (Prompt Architecture v2 trio)
**Blocker xử lý:** production trajectory `89 → parser fail → 0 → REWRITE_REQUIRED
→ revision-remediation-exhausted`

Chi tiết điều tra: [editorial-v2-parser-production-failure.md](../debug/editorial-v2-parser-production-failure.md)

---

## Mục tiêu

Một lỗi **định dạng** của Editorial Review không bao giờ được biến thành một
phán quyết **nội dung**.

## Invariant

| Invariant | Cưỡng chế ở đâu |
|---|---|
| Malformed không có điểm chất lượng | `inspectEditorialReview` trả `totalScore=null` khi `parseFailure` |
| Malformed không thành REWRITE/MINOR verdict | workflow branch `if (inspection.parseFailure)` chạy **trước** mọi xử lý verdict |
| Malformed không tiêu revision budget | action riêng `editorial-review-format-invalid`; `countRemediationsInCurrentCycle` chỉ đếm `remediate-required-revision` |
| Best candidate được giữ | không tạo candidate, không đổi `draft12`, artifact REVIEW không gắn `sourceRevision` |
| Retry hữu hạn | `MAX_EDITORIAL_REVIEW_FORMAT_RETRIES = 2`, đếm theo cycle anchor |
| Hết lượt thì dừng an toàn | `editorial-review-format-exhausted` + Human Review pending |

## Thay đổi

**Mới**
- `web/src/lib/tfes/machine-contract.ts` — normalization layer dùng chung.
- `buildEditorialFormatRepairPromptV2` — prompt chỉ sửa định dạng.
- `MAX_EDITORIAL_REVIEW_FORMAT_RETRIES`, `isEditorialFormatExhausted`.
- `web/src/lib/tfes/editorial-format-reliability.test.ts` — 27 test.

**Sửa**
- `editorial-review-gate.ts`: normalization, precedence v2 > canonical,
  placeholder-zero guard, `parseFailure` + `malformedReasonCode` +
  `outputTruncated` + `rawOutputLength` + `parserVersion`.
- `prompt-registry.ts`: `parseMarkedPromptJson` uỷ quyền cho layer mới; telemetry
  prompt thêm trường parse/format-retry.
- `prompts-v2.ts`: hardening `editorial-diagnosis@2.0` (JSON-only, enum chính xác,
  cấm số dạng string, cấm placeholder 0, trần 12 defect).
- `workflow.ts`: format-retry branch, `maxTokens` v2 3200, `revisionBudgetConsumed`.
- `remediation-metrics.mjs`: nhóm `editorialFormat`.

## Không làm

Patch Editing, multi-agent, Final Delta, refactor `workflow.ts`, schema/migration,
đổi model, nâng revision retry 3 → 5.

## Rollback

Không cần migration, không thêm flag. `promptArchitecture.enabled=false` đưa
Editorial về v1.6; normalization layer và format retry vẫn hoạt động và vẫn an
toàn cho canonical/legacy contract. Muốn bỏ hẳn thì revert commit — dữ liệu cũ
không bị ảnh hưởng vì mọi trường telemetry đều additive.

## Definition of Done

- [x] Root cause có evidence từ code/test
- [x] Parser normalize an toàn, không nuốt ambiguity
- [x] Format retry tách khỏi revision budget
- [x] Fail-safe pause thay vì REWRITE giả
- [x] Candidate tốt nhất được giữ
- [x] Telemetry + metrics có denominator rõ
- [x] `npm run ci` PASS (197 test), `git diff --check` sạch
