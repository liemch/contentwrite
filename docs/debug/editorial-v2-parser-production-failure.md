# Editorial Review v2 — production parser failure (89 → 0 → REWRITE → exhausted)

**Ngày:** 2026-08-07
**Trạng thái:** FIXED — MULTIPLE ROOT CAUSES
**Phạm vi:** `editorial-diagnosis@2.0`, Editorial Review parser, workflow fallback,
retry budget, telemetry. Không đụng schema, model, Patch Editing, multi-agent.

Liên quan: [WP-PV2-02](../work-packages/WP-PV2-02-editorial-format-reliability.md) ·
[remediation-metrics.md](../validation/remediation-metrics.md)

---

## 1. Trajectory bị báo lỗi

```
Editorial 64 → remediation → Editorial 89 → Editorial "score 0"/REWRITE_REQUIRED
→ revision-remediation-exhausted
```

Bài bị đốt hết cycle budget dù candidate 89 vẫn tồn tại.

## 2. Failure path tái hiện bằng code

| Bước | Vị trí | Hành vi trước fix |
|---|---|---|
| LLM output | `workflow.ts` Editorial Review phase | `maxTokens = 2200` cho cả v1.6 và v2 |
| Marker extraction | `prompt-registry.parseMarkedPromptJson` | chỉ đọc marker **đầu tiên**; fence đơn giản |
| JSON parse | cùng hàm | `JSON.parse` lỗi → `null`, mất toàn bộ contract |
| Contract validation | `editorial-review-gate.parseV2Editorial` | `contractVersion` phải khớp tuyệt đối; score phải là `number`; gates chỉ nhận mảng object với `PASSED`/`FAILED` |
| Editorial result | `inspectEditorialReview` | malformed → `resolvedState = MINOR_REVISION_REQUIRED`, vẫn trả `totalScore` thô |
| Workflow decision | `workflow.ts` commit `to: effectiveReviewState` | article chuyển sang state revision |
| Remediation count | `finalize-phase.finalizePhaseOf` → `revision-remediate` | chạy remediation LLM và ghi `remediate-required-revision` → **+1 revision budget** |
| Exhausted | `remediationAttempts >= MAX_REVISION_REMEDIATION_RETRIES` | sau 3 vòng → `revision-remediation-exhausted` |

Kết luận: **không hề có format retry riêng cho Editorial Review** (chỉ Final
Verification có `final-verification-format-invalid`), nên mọi lỗi định dạng đều
đi thẳng vào ngân sách sửa nội dung.

## 3. Root cause (có evidence)

| # | Loại | Evidence | Hệ quả |
|---|---|---|---|
| RC-1 | **E + F** workflow fallback + retry budget sai | `inspectEditorialReview` trả `MINOR_REVISION_REQUIRED` khi `!machineReadable`; `finalizePhaseOf` map MINOR → `revision-remediate` | parser fail tiêu revision budget → exhausted |
| RC-2 | **C + D** parser/contract | prompt v2 in mẫu `"totalScore": 0`; parser chỉ chặn degenerate 0/0, nên `total=0, insight=22` → `stateFromScores` → `REWRITE_REQUIRED` | placeholder echo thành **REWRITE thật** |
| RC-3 | **B** parser quá strict | numeric string, gates dạng object map / `PASS`, enum sai hoa-thường, thiếu `contractVersion`, trailing comma đều làm rụng cả contract | output đúng nghĩa vẫn bị coi malformed |
| RC-4 | **G** truncation | `reviewMaxTokens = 2200` cho JSON typed 8 gates + defects (mỗi defect tới ~1KB) | JSON cụt → `null` → RC-1 |
| RC-5 | **D** precedence | `hasCanonical` được xét **trước** `v2.contractPresent` | một dòng `PROVISIONAL_*` trong prose làm mất toàn bộ defects v2 |
| RC-6 | **H** telemetry | `telemetry.totalScore = inspection.totalScore` và `convergence.currentScore` nhận điểm thô | timeline hiển thị 89 → 0 như regression chất lượng thật |

## 4. Khác biệt raw vs contract

Các biến thể malformed tái tạo được (đều có fixture trong
`editorial-format-reliability.test.ts`): fenced JSON, prose bao quanh, numeric
string `"89"` / `"23/30"`, gates object map, `PASS`/`pass`, enum
`minor revision required`, thiếu `contractVersion`, thiếu optional field, unknown
field, trailing comma, newline thô trong string, JSON cụt, hai machine block.

## 5. Fix

1. **Normalization layer mới** `machine-contract.ts` chạy trước validation:
   quét mọi marker (block hợp lệ **cuối** thắng), bóc fence, salvage trailing
   comma + newline thô trong string, phát hiện object không đóng = truncation,
   ép kiểu số/enum/boolean an toàn.
2. **Parser v2** nhận gates dạng mảng object / mảng string / object map, alias
   `PASS`/`FAIL`, enum chuẩn hoá hoa-thường-dấu cách, `contractVersion` khuyết
   vẫn nhận nếu block có key lõi. `severity`/`blocking` chuẩn hoá tương tự.
3. **Placeholder guard**: `totalScore = 0` luôn là malformed, không bao giờ là
   verdict.
4. **Precedence**: block v2 có marker thắng canonical lines.
5. **Malformed ⇒ không có điểm**: `totalScore`/`insightScore`/`decision` trả
   `null`/rỗng; điểm thô chỉ còn ở `rawTotalScore`/`rawInsightScore` để debug.
6. **Dedicated format retry** trong workflow: `editorial-review-format-invalid`
   (state **không đổi**, budget revision **không tăng**), prompt lần 2 là
   `buildEditorialFormatRepairPromptV2` — chỉ ép định dạng, cấm chấm lại.
7. **Fail-safe**: hết lượt → `editorial-review-format-exhausted` + Human Review
   pending. Không REWRITE giả, không đổi `draft12`, best candidate giữ nguyên.
8. **Truncation**: `maxTokens` Editorial v2 nâng 2200 → 3200 và prompt giới hạn
   12 defects.

## 6. Invariant được bảo vệ

- `PARSE_FORMAT_FAILURE` ≠ `CONTENT_REVIEW_FAILURE`: `errorClass="parser"`,
  `revisionBudgetConsumed=false`, không sinh gate fail G1–G8.
- Candidate 89: parse failure không tạo `BestCandidateReference`, không ghi
  artifact REVIEW gắn `sourceRevision`, không đổi active draft.
- Format retry hữu hạn: `MAX_EDITORIAL_REVIEW_FORMAT_RETRIES = 2`, đếm theo cycle
  anchor nên Human Review confirm sẽ mở lượt mới.

## 7. Cách xác nhận lại nếu tái phát

1. Xem transition `editorial-review-format-invalid` →
   `details.malformedReasonCode`, `outputTruncated`, `rawOutputLength`.
2. `malformedReasonCode = json-truncated` → tăng token hoặc siết số defect.
3. `missing-decision` / `gates-incomplete` → prompt contract, không phải parser.
4. Report `editorialFormat.*` cho tỷ lệ tổng thể theo cohort.
