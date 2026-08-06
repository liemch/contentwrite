# Điều tra: "Revision chưa đạt sau 3 lần remediation"

**Ngày:** 2026-08-06
**Loại:** Root-cause investigation (read-only — không sửa code, không refactor, không thêm feature)
**Triệu chứng production:** `Revision chưa đạt sau 3 lần remediation — cần editor sửa tay hoặc làm lại workflow.`
**Nguồn thông báo:** `web/src/lib/tfes/workflow.ts:1267-1281`

---

## 0. Tóm tắt điều hành

Thông báo này **không phải một lỗi crash** — nó là điểm dừng có chủ đích khi bộ đếm remediation chạm trần
`MAX_REVISION_REMEDIATION_RETRIES = 3`. Vấn đề thật là **vòng remediation gần như không có cơ hội hội tụ**, vì:

1. **Gate bước 8 chấm trên một bản nháp bị cắt cụt.** Review chỉ nhận `clipText(draft, 7_000)` ký tự
   (`workflow.ts:1130`) trong khi nháp 12 phần thực tế thường 8.000–11.000 ký tự → reviewer không nhìn thấy
   References / Key Takeaways / Discussion → G1 (cấu trúc) và G6 (kết mở) rất dễ bị đánh Fail vĩnh viễn.
2. **Reviewer không có Research Brief.** G3 "Đủ bằng chứng theo tier của domain" được chấm mà không có nguồn
   để đối chiếu (`workflow.ts:1126-1136`).
3. **Một Fail duy nhất trên checklist ⇒ không được EDITORIAL_REVIEWED**, kể cả khi tổng điểm 95
   (`editorial-review-gate.ts:84-91`). Đây là ràng buộc chặt nhất của toàn pipeline.
4. **Ngân sách 3 lượt bị dùng chung cho ba cổng khác nhau** (Review bước 8, Pre-9b GOLD_BAR, Final
   Verification 9b) vì cả ba đều chuyển sang `MINOR/MAJOR/REWRITE_REQUIRED` và cùng rơi vào phase
   `revision-remediate` (`workflow.ts:471-475`).
5. **Bản revision nhiều khả năng bị cắt do thiếu token.** `maxTokens: 5600` (`workflow.ts:1309`) thấp hơn
   chính công thức của dự án (`cleanGenMaxTokens` = 5 token/từ + 2.000 ≈ 9.000 token cho bài 1.400 từ,
   `quality.ts:483-490`) → draft mới cụt đuôi → vòng sau lại Fail cấu trúc.
6. **Feedback mới nhất bị cắt khỏi prompt remediation.** `clipText(knowledgeRecord, 6_000)` giữ **6.000 ký tự
   đầu**, trong khi phần `## Final Verification (pipeline)` được **append vào cuối** (`workflow.ts:1613`) →
   đúng phần lý do trượt lại là phần bị bỏ đi.
7. **Ba vòng là ba lần lấy mẫu độc lập, không phải một quá trình hội tụ.** Prompt giống hệt nhau, không có
   lịch sử "đã thử gì", và `knowledgeRecord` bị ghi đè mỗi vòng nên model không biết mình đã sửa gì trước đó.

Và cuối cùng: **lời khuyên trong thông báo lỗi không thực hiện được**. `draft12` không có đường sửa tay trong
UI (chỉ `cleanPublish` mới có API PATCH — `web/src/app/api/articles/[id]/route.ts:40-51`), còn cổng Human
Review đã bị auto-ack đóng lại. Thực tế editor chỉ còn một lựa chọn: **Làm lại từ đầu (reset)**.

---

## 1. Sơ đồ luồng thực tế

```
DRAFTED
  │
  ├─(FINALIZE / finalizePhaseOf = "review")──────────────────────────────┐
  │   LLM: finalize-review (maxTokens 2200, temp 0.35)                   │
  │   inspectEditorialReview() → resolvedState                           │
  │                                                                      │
  │   Lần đầu (không có POST_REVISION_REVIEW_MARK):                      │
  │     knowledgeRecord += HUMAN_REVIEW_PENDING  →  phase "await-human"   │
  │        │                                                             │
  │        └─ editor bấm «Nhờ AI sửa» → confirmHumanReview()             │
  │             action = "human-review-confirmed"   ← MỐC RESET BỘ ĐẾM   │
  │             state giữ nguyên MINOR/MAJOR/REWRITE                     │
  │                                                                      │
  │   Sau revision (có POST_REVISION_REVIEW_MARK):                       │
  │     đạt   → auto-ack (ack-pass) → EDITORIAL_REVIEWED                 │
  │     chưa  → auto «nhờ AI sửa» → MINOR/MAJOR/REWRITE (không pause)    │
  │                                                                      │
  ▼                                                                      │
MINOR_/MAJOR_/REWRITE_REQUIRED                                           │
  │                                                                      │
  ├─(FINALIZE / phase = "revision-remediate")                            │
  │   ① count(action="remediate-required-revision"                       │
  │           AND workflowRunId = hiện tại                               │
  │           AND createdAt > human-review-confirmed gần nhất)           │
  │   ② nếu ≥ 3  → commitPatch("revision-remediation-exhausted") ■ STOP  │
  │   ③ ngược lại: LLM finalize-revision-remediate (maxTokens 5600)      │
  │      assertFullDraftQuality + assertEngineeringGoldBar               │
  │      → DRAFTED, factCheck=null, cleanPublish=null, heroBrief=null,   │
  │        knowledgeRecord = review cũ + POST_REVISION_REVIEW_MARK       │
  └──────────────────────────────────────────────────────────────────────┘
       ▲                                                     │
       │                                                     ▼
       │                                             (quay lại "review")
       │
       │  Ngoài bước 8, HAI cổng khác cũng đổ vào đây và tiêu cùng ngân sách:
       ├── Pre-9b GOLD_BAR fail → MINOR_REVISION_REQUIRED (workflow.ts:1514-1529)
       └── Final Verification 9b fail → MINOR/MAJOR/REWRITE (workflow.ts:1605-1631)
```

---

## 2. Trả lời 12 câu hỏi

### 1) Điều kiện nào khiến remediation fail

Không có điều kiện "fail" riêng của remediation. Bản thân bước remediation gần như luôn thành công
(nó chỉ gọi LLM và ghi draft mới). Cái fail là **cổng chấm sau đó**. Có đúng ba cổng đẩy bài quay lại
`revision-remediate`, và **cả ba dùng chung một bộ đếm**:

| Cổng | Vị trí | Điều kiện trượt | State kết quả |
|---|---|---|---|
| Editorial Review (bước 8) | `editorial-review-gate.ts:69-93` | `insight < 20` hoặc `total < 75` → REWRITE; `total < 85` → MAJOR; **`gateFailCount > 0`** hoặc `total < 85` hoặc `insight < 20` → MINOR | MINOR/MAJOR/REWRITE |
| Pre-9b GOLD_BAR | `workflow.ts:1508-1529` | bất kỳ failure nào của `inspectEngineeringGoldBar` (opener generic, thiếu mini-case, thiếu "khi nào không", giọng handbook, khuyến nghị không điều kiện, case không neo Research) | MINOR |
| Final Verification (9b) | `final-verification.ts:89-189` + `workflow.ts:1605-1612` | `total < 87` hoặc `insight < 22` hoặc `GATES_G1_G8 ≠ PASSED` hoặc `OPEN_REQUIRED_ACTIONS ≠ 0` hoặc Fact ≠ PASSED hoặc còn blocking claim | MINOR/MAJOR/REWRITE |

Điều kiện dừng cứng (`workflow.ts:1257-1281`):

```ts
const remediationAttempts = await prisma.workflowTransition.count({
  where: {
    articleId,
    workflowRunId: article.workflowRunId,
    action: "remediate-required-revision",
    ...(latestHumanConfirmation ? { createdAt: { gt: latestHumanConfirmation.createdAt } } : {}),
  },
});
if (remediationAttempts >= MAX_REVISION_REMEDIATION_RETRIES) { /* STOP */ }
```

`MAX_REVISION_REMEDIATION_RETRIES = 3` (`retry-policy.ts:1`). Bộ đếm chỉ reset khi có transition
`human-review-confirmed` **mới hơn** — xem mục 11 để biết vì sao mốc reset này không còn với tới được.

### 2) Vì sao sau 3 lần vẫn không đạt

Sáu nguyên nhân độc lập, cộng dồn:

**(a) Reviewer chấm trên bản nháp cụt.** `workflow.ts:1126-1136`:

```ts
appendContext(
  clipText(article.insightGate, 1_200),
  clipText(stripPipelineMarks(article.draft12), 7_000),   // ← chỉ 7.000 ký tự
  `Chủ đề: ${topic}`,
)
```

`assertFullDraftQuality` yêu cầu ≥ 900 từ (`quality.ts:440`), target mặc định 1.200 từ
(`pipeline-config.ts:11`), thực tế nháp 12 phần thường 1.300–1.800 từ ≈ **8.000–11.200 ký tự** (tiếng Việt
~6,2 ký tự/từ kể cả khoảng trắng). 7.000 ký tự ≈ 1.130 từ → **15–40% cuối bài bị cắt**, và phần bị cắt chính
là References, Key Takeaways, Discussion. `clipText` còn chèn thẳng dòng `[…đã cắt N ký tự…]`
(`parser.ts:158-162`) nên model biết rõ bài thiếu đuôi.

Hệ quả trực tiếp trên checklist Review.md:
- G1 "Cấu trúc phù hợp; không tạo mục rỗng để đủ form" → Fail.
- G6 "Có kết mở/câu hỏi thảo luận phù hợp" → Fail (phần kết nằm ngoài vùng nhìn thấy).

**(b) Reviewer không có Research Brief và không có Fact Check.** Prompt `finalize-review` yêu cầu chấm
"Đủ bằng chứng" (G3) nhưng CONTEXT chỉ có Insight Gate + nháp cụt. Không có nguồn để đối chiếu ⇒ đánh Fail
là lựa chọn an toàn của model. Remediation không thể sửa được lỗi này vì lỗi nằm ở **prompt context**, không
nằm trong bài.

**(c) Một Fail = trượt, bất kể điểm.** `editorial-review-gate.ts:84-91`:

```ts
if (!gatesPassed || gateFails > 0 || (total < minTotal) || (insight < minInsight)) {
  return WorkflowState.MINOR_REVISION_REQUIRED;
}
```

Không có khái niệm "gate blocking" vs "gate cosmetic". Một dòng `- [ ] G6 … Fail` ép trượt cả bài 95 điểm.

**(d) Bản revision nhiều khả năng bị cắt vì thiếu token.** `workflow.ts:1309` dùng `maxTokens: 5600` cố định
cho một output phải là **toàn bộ nháp 12 phần**. Chính dự án định nghĩa công thức ngân sách token tại
`quality.ts:483-490` / `pipeline-config.ts:31-38`: `5 token/từ + 2.000` — tức bài 1.400 từ cần ~9.000 token.
5.600 token thiếu ~40%. Model dùng `openai/gpt-oss-120b` (`nvidia.ts:16`) với reasoning bật; parser SSE chỉ
đọc `delta.content` (`nvidia.ts:99-102`) nên phần reasoning vẫn ăn ngân sách mà không hiện ra. Kết quả rất
dễ là một draft cụt đuôi → vòng review sau lại Fail cấu trúc → lặp.

**(e) Ba vòng là ba lần lấy mẫu, không phải hội tụ.** Xem câu 3.

**(f) Ngân sách 3 lượt bị chia cho ba cổng.** Một kịch bản production hoàn toàn bình thường:

| Lượt | Sự kiện | Attempt sau lượt |
|---|---|---|
| 0 | Review bước 8 đạt → editor confirm → Fact PASSED → 9b chấm 86/100 (dưới sàn near-miss 87) → MINOR | 0 |
| 1 | remediate #1 → về DRAFTED, factCheck bị xoá → review lại → Fail G6 → MINOR | 1 |
| 2 | remediate #2 → review lại → Fail G3 → MINOR | 2 |
| 3 | remediate #3 → review đạt → Fact chạy lại → 9b chấm 88 → MINOR | 3 |
| 4 | vào `revision-remediate` → **STOP** | — |

Bài chỉ thực sự tới được cổng 9b **hai lần** trong toàn bộ ngân sách 3 lượt.

### 3) Mỗi vòng remediation sửa gì

**Cả ba vòng chạy đúng một prompt, đúng một cấu hình, khác nhau chỉ ở input.**
`prompts.ts:453-466` (`finalize-revision-remediate`):

```
## Nhiệm vụ REVISION REMEDIATION (AI-TFES v1.6)
Sửa toàn bộ bản nháp Article.md theo **Required Revisions**, Quality Gates và Fact-Check Ledger
trong CONTEXT. Mức MINOR/MAJOR/REWRITE quyết định độ sâu sửa, nhưng không được bỏ qua lỗi.

- MINOR: sửa chính xác wording, flow, điều kiện và claim cục bộ.
- MAJOR: sửa các phần liên quan, logic/evidence và recommendations; giữ insight nếu vẫn ≥L2.
- REWRITE: viết lại cấu trúc/lập luận từ Planning + Research Brief, không cứu câu chữ cũ bằng đổi từ.
- Unsupported/Contradicted/Unverifiable: xử lý theo FactCheck.md; không thêm số/nguồn mới.
- Giữ đủ nháp Article.md, insight ≥L2, phản biện và "khi nào không".

Chỉ xuất toàn bộ bản nháp Markdown revision mới, bắt đầu bằng `# Title`. Không giải thích,
không output Review, Fact Check, Knowledge Record, bản sạch, Hero hoặc STATUS.
```

Biến duy nhất phân biệt độ sâu sửa là dòng `Revision state: ${article.workflowState}`
(`workflow.ts:1296`). Không có:

- **Số vòng hiện tại** — model không biết đây là lần 1 hay lần 3.
- **Lịch sử đã thử** — `knowledgeRecord` bị **ghi đè hoàn toàn** bởi review mới ở mỗi vòng
  (`workflow.ts:1211-1212`), nên feedback vòng trước biến mất.
- **Escalation** — không có chỉ thị "lần này sửa khác đi", không tăng temperature, không đổi chiến lược.

Thêm vào đó `nvidia.ts:74` hardcode `seed: 42` và remediation chạy `temperature: 0.25`. Với input gần giống
nhau, output cũng gần giống nhau — retry gần như không có khả năng "lấy mẫu thoát" khỏi lỗi.

Cuối mỗi vòng, state bị dọn khá mạnh (`workflow.ts:1332-1339`):

```ts
articlePatch: {
  draft12: `${repairedDraft}\n\n${WRITE_DONE_MARK}`,
  factCheck: null,        // ← huỷ Fact Check đã PASSED
  knowledgeRecord: `${retainedReview}\n\n${POST_REVISION_REVIEW_MARK}`.trim(),
  cleanPublish: null,     // ← huỷ bản sạch nếu đã có
  heroBrief: null,
  errorMessage: null,
}
```

### 4) Prompt của gate

**Gate bước 8** — `prompts.ts:389-419`:

```
## Nhiệm vụ bước 8: EDITORIAL REVIEW (AI-TFES v1.6)
Tự review bản nháp theo pha EDITORIAL_REVIEW — CHƯA Fact-Check Ledger / Bản sạch / Hero.
Evidence bắt buộc ghi PROVISIONAL.

Phải đạt hết (ghi Pass/Fail từng mục):
- Cấu trúc đầy đủ (12 phần Article.md)
- Không lỗi logic
- Đủ bằng chứng
- Một insight trung tâm ≥L2 + ≥1 trade-off + ≥1 góc phản biện + ≥1 bài học
- Giá trị thực tiễn (biết nên / không nên làm gì)
- Có câu hỏi thảo luận — chỉ Fail nếu shape bắt buộc discussion mà thiếu
- Không quảng bá · Không sao chép
- Tránh tuyệt đối hóa ("luôn luôn / chắc chắn / tốt nhất…") trừ khi có bằng chứng
- **Nhịp đọc:** Fail nếu listicle đánh số …, mục "không nên" lặp, hoặc các phần không nối với nhau
- **Đa dạng format:** Pass nếu nháp chuẩn bị được bản sạch theo ARTICLE_SHAPE

## Chấm điểm provisional (bắt buộc — runtime đọc máy)
- Insight Depth tối thiểu phản ánh Gate L2: thường ≥20/30 (bar cuối 9b là ≥22).
- Chỉ dùng EDITORIAL_REVIEWED khi tổng provisional ≥85 và insight ≥20 và G1–G8 PASSED
  và 0 gate Fail trên checklist.
- Còn Fail G* hoặc điểm dưới ngưỡng → MINOR/MAJOR/REWRITE — không tự khai EDITORIAL_REVIEWED.

Xuất theo template Review.md với review_phase: EDITORIAL_REVIEW.
Kết thúc bằng đúng 4 dòng máy đọc (plain text, mỗi trường một dòng):
PROVISIONAL_TOTAL_SCORE: <0-100>
PROVISIONAL_INSIGHT_SCORE: <0-30>
GATES_G1_G8: <PASSED|FAILED>
EDITORIAL_DECISION: <EDITORIAL_REVIEWED|MINOR_REVISION_REQUIRED|MAJOR_REVISION_REQUIRED|REWRITE_REQUIRED>
```

Prompt này được nối thêm **toàn bộ `05-Templates/Review.md`** (`prompts.ts:275, 419`). Template đó lại yêu cầu
machine lines tên **`FINAL_*`** trong một code fence (`Review.md:59-66`) và liệt kê đủ 4 enum trong mục
Decision (`Review.md:54-57`). Đây là mâu thuẫn chỉ thị trực tiếp trong cùng một prompt — hệ quả ở câu 9.

**Gate 9b** — `prompts.ts:468-499` (`finalize-verify`), bar cao hơn hẳn: tổng ≥90, insight ≥22, G1–G8 PASSED,
Fact PASSED, 0 required action, 5 dòng máy đọc `FINAL_*`.

### 5) Prompt của revision

Đã trích đầy đủ ở câu 3. Ba điểm đáng lưu ý về cách nó được **gọi** (`workflow.ts:1288-1310`):

- `temperature: 0.25`, `reasoningEffort: "low"`, `maxTokens: 5600`.
- CONTEXT được ghép bằng `appendContext` với thứ tự và hạn mức:
  `Revision state` → `researchBrief(4.000)` → `insightGate(2.000)` → `draft12(12.000)` →
  `knowledgeRecord(6.000)` → `factCheck(5.000)` → `Chủ đề`.
- **Không dùng `priorPipelineSupportBlock`.** Hàm này (`workflow.ts:238-266`) tồn tại sẵn và tạo block
  `### Editorial Review (bước 8) — BẮT BUỘC xử lý các Fail / Minor–Major dưới đây`, được bước Fact Check và
  bước Polish dùng — nhưng bước remediation lại dump `knowledgeRecord` thô. Feedback không được đánh dấu là
  "bắt buộc sửa", và không được đưa lên đầu.

### 6) Dữ liệu truyền qua từng bước

| Bước | Đọc vào (hạn mức ký tự) | maxTokens / temp | Ghi ra | State sau |
|---|---|---|---|---|
| 8 · Review | `insightGate` (1.200) · `draft12` (**7.000**) · topic · ARTICLE_SHAPE · Review.md | 2200 / 0.35 | `knowledgeRecord` (ghi đè), `errorMessage`, artifact REVIEW | `EDITORIAL_REVIEWED` \| `MINOR` \| `MAJOR` \| `REWRITE` |
| await-human | — | — | `errorMessage = null` | giữ nguyên |
| confirmHumanReview | `knowledgeRecord` | — | `knowledgeRecord` + `HUMAN_REVIEW_DONE` + block, `reviewerNotes` | giữ nguyên (nếu cần AI sửa) hoặc `EDITORIAL_REVIEWED` |
| revision-remediate | `researchBrief` (4.000) · `insightGate` (2.000) · `draft12` (12.000) · `knowledgeRecord` (**6.000, cắt từ đầu**) · `factCheck` (5.000) · Article.md | **5600** / 0.25 | `draft12`, **`factCheck=null`**, **`cleanPublish=null`**, **`heroBrief=null`**, `knowledgeRecord`=review giữ lại + `POST_REVISION_REVIEW_MARK` | `DRAFTED` |
| 9 · Fact Check | `researchBrief` (2.500) · `insightGate` (1.000) · `draft12` (6.000) · support block | 2500 / 0.3 | `factCheck` | `FACT_CHECKED` \| `FACT_CHECK_FAILED` |
| 9b · Final Verification | `extractEditorialReview()` (3.000) · `factCheck` (4.000) · `draft12` (**7.000**) · rescoreHint | 2200 / 0.2 | `knowledgeRecord += "## Final Verification (pipeline)"` (**append cuối**) | `FINAL_REVIEWED` \| `MINOR` \| `MAJOR` \| `REWRITE` |

**Điểm gãy dữ liệu quan trọng nhất:** 9b append kết quả vào **cuối** `knowledgeRecord` (`workflow.ts:1613`),
nhưng remediation cắt `knowledgeRecord` từ **đầu** ở 6.000 ký tự (`workflow.ts:1300`). Với Editorial Review
~3.000–5.000 ký tự + block Human Review + Final Verification ~3.500–5.500 ký tự, tổng vượt 6.000 rất dễ dàng
⇒ **prompt remediation thường không chứa lý do trượt 9b**. Model được yêu cầu "sửa theo Required Revisions"
mà không được đưa Required Revisions.

### 7) Gate đánh giá dựa trên tiêu chí nào

Ngưỡng số (`contract.ts:8-23`):

| Cổng | Total | Insight | Khác |
|---|---:|---:|---|
| Bước 8 (provisional) | ≥ 85 | ≥ 20 | `GATES_G1_G8 = PASSED` **và** `gateFailCount == 0` |
| 9b (final) | ≥ 90 (grace 87) | ≥ 22 | G1–G8 PASSED · Fact PASSED · 0 open action · 0 blocking claim |

Cách máy đọc điểm (`editorial-review-gate.ts:20-31, 98-124`):
- `numberAfter(PROVISIONAL_TOTAL_SCORE)` ?? `numberAfter(FINAL_TOTAL_SCORE)`
- `numberAfter(PROVISIONAL_INSIGHT_SCORE)` ?? `numberAfter(FINAL_INSIGHT_SCORE)`
- `machineEnum("GATES_G1_G8", [PASSED, FAILED])`
- `machineEnum("EDITORIAL_DECISION", …)` ?? `machineEnum("FINAL_DECISION", …)`
- `countEditorialGateFails()` — đếm dòng khớp `^\s*[-*]?\s*(\[[ xX]\])?\s*(G|N)\d+ … Fail`

Quy tắc quyết định (`editorial-review-gate.ts:69-93, 167-195`): lấy **mức nghiêm hơn** giữa điểm và enum do
model tự khai. Model khai `EDITORIAL_REVIEWED` nhưng điểm không đủ → bị override xuống.

Checklist gốc — `content/ai-tfes/05-Templates/Review.md:29-37`:

```
## Quality Gates — phải đạt hết
- [ ] G1 Cấu trúc phù hợp; không tạo mục rỗng để đủ form
- [ ] G2 Không lỗi logic
- [ ] G3 Đủ bằng chứng theo tier của domain
- [ ] G4 Insight trung tâm ≥L2
- [ ] G5 Có giá trị thực tiễn và điều kiện áp dụng
- [ ] G6 Có kết mở/câu hỏi thảo luận phù hợp
- [ ] G7 Không quảng bá/clickbait
- [ ] G8 Không sao chép
```

### 8) Tiêu chí nào khó đạt nhất

Xếp theo khả năng chặn vĩnh viễn (không thể sửa bằng cách viết lại bài):

| Hạng | Tiêu chí | Vì sao khó | Sửa được bằng remediation? |
|---|---|---|---|
| 1 | **`gateFailCount == 0`** | Một Fail duy nhất ép MINOR bất kể điểm; 8 gate × 3 vòng = 24 cơ hội trượt | Về lý thuyết có, thực tế xác suất thấp |
| 2 | **G1 Cấu trúc đầy đủ 12 phần** | Reviewer chỉ thấy 7.000 ký tự đầu; nếu draft revision lại bị cắt vì `maxTokens 5600` thì bài **thật sự** thiếu đuôi | **Không** — lỗi ở context/token budget |
| 3 | **G3 Đủ bằng chứng** | Reviewer không được cấp Research Brief lẫn Fact Check | **Không** — lỗi ở context |
| 4 | **G6 Có kết mở / câu hỏi thảo luận** | Mâu thuẫn chỉ thị: 4/9 ARTICLE_SHAPE đặt `discussion: "skip"` với chỉ thị *"CẤM mục Câu hỏi thảo luận khuôn mẫu"* (`article-shapes.ts:287-292`), trong khi Review.md ghi G6 "phải đạt hết". Bài tuân thủ shape sẽ Fail G6 | **Không** — mâu thuẫn spec |
| 5 | **9b total ≥ 87** trong khi bước 8 chỉ cần ≥ 85 | Vùng chết 85–86: qua bước 8 nhưng trượt 9b, và mỗi lần trượt tốn 1 lượt remediation | Có, nhưng đắt |
| 6 | **`OPEN_REQUIRED_ACTIONS: 0`** (9b) | Model vừa liệt kê Required Revisions vừa phải khai 0 open action — mâu thuẫn tự nhiên với vai trò reviewer | Một phần |
| 7 | **GOLD_BAR `UNGROUNDED_SCENE`** | Jaccard token overlap < 0.04 giữa mini-case và Research Brief (`engineering-gold-bar.ts:226-239`) — ngưỡng heuristic, model không biết mình đang bị chấm bằng gì | Mù mờ |

### 9) Có parser nào làm sai dữ liệu không

**Có — bốn lỗi parser thực sự.**

**P1 — Fallback state leo thang oan lên REWRITE_REQUIRED.** `editorial-review-gate.ts:149-166`:

```ts
if (!machineReadable) {
  const fromEnum = stateFromEnum(normalizedDecision);
  const fromText = /REWRITE_REQUIRED/i.test(body)          // ← quét TOÀN BỘ body
    ? WorkflowState.REWRITE_REQUIRED
    : /MAJOR_REVISION_REQUIRED/i.test(body) ? … : …;
  resolvedState = fromEnum ?? fromText;
}
```

`body` là toàn văn review, mà review được sinh từ template Review.md — template **liệt kê đủ 4 enum** trong
mục Decision (`Review.md:54-57`) và trong code fence machine lines (`Review.md:65`). Model copy nguyên phần
giải thích enum là chuyện rất thường. Khi machine lines thiếu (xem P2), bất kỳ review nào có nhắc chuỗi
`REWRITE_REQUIRED` ở bất cứ đâu đều bị phân loại **REWRITE_REQUIRED**, kéo theo prompt remediation chuyển sang
chế độ *"viết lại cấu trúc/lập luận từ đầu"* → mỗi vòng ra một bài khác hẳn → không hội tụ.

Đối chiếu: 9b **không** có lỗi này — nó coi machine lines thiếu là "sai format" và retry riêng
(`final-verification.ts:156-164`, `workflow.ts:1567-1604`), không tiêu lượt remediation. Bước 8 thiếu hoàn
toàn cơ chế tương đương.

**P2 — Mâu thuẫn `PROVISIONAL_*` vs `FINAL_*` làm machine lines dễ mất.** Prompt yêu cầu `PROVISIONAL_*`
(`prompts.ts:410-414`), template đính kèm yêu cầu `FINAL_*` trong code fence (`Review.md:59-66`). Gate có
fallback đọc `FINAL_*` nên phần lớn trường hợp vẫn cứu được, nhưng khi model trộn hai định dạng hoặc bị cắt
output ở `maxTokens: 2200` (machine lines nằm **cuối** file, còn parser SSE bỏ qua `reasoning_content` —
`nvidia.ts:99-102`) thì `totalScore = null` → rơi thẳng vào P1.

**P3 — `countEditorialGateFails` không đọc được checklist dạng bảng.**
`editorial-review-gate.ts:47-48`:

```ts
/(?:^|\n)\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?((?:G|N)\d+)\s*[^|\n]*?\bFail\b/gi
```

Dòng bắt đầu bằng `|` (markdown table row `| G1 | … | Fail |`) không khớp vì sau `\s*` chỉ chấp nhận `-`, `*`
hoặc `[ ]`. Nên gate **bỏ sót** Fail khi model xuất bảng, trong khi `parseEditorialFindings` (dùng vòng quét
dòng riêng, `human-review.ts:73-95`) **lại bắt được**. Hai bộ đếm lệch nhau → số findings hiển thị cho editor
không khớp với quyết định của máy.

**P4 — `parseEditorialFindings` bắt cả dòng tiêu đề / chú giải.** `human-review.ts:73-95` nhận mọi dòng chứa
chuỗi `fail`, kể cả header bảng `| Tiêu chí | Pass/Fail | Ghi chú |`. Dòng này dài > 8 ký tự và không khớp
blacklist `^(dimension|trọng|ghi chú)` → được đẩy thành một "finding" giả. Trong luồng auto sau revision, mỗi
finding giả thành một item `disposition: "fixed"` (`workflow.ts:1173-1186`) → nhiễu block Human Review, và
trong luồng thủ công thì editor bị bắt xác nhận một mục vô nghĩa (`workflow.ts:2231-2242`).

**Không có test nào** cho `inspectEditorialReview` / `countEditorialGateFails` — grep toàn repo chỉ ra 5 file
tham chiếu và không file nào là `*.test.ts`.

### 10) Có bug logic nào khiến revision không cải thiện không

**B1 — Feedback mới nhất bị cắt khỏi prompt (nghiêm trọng).** 9b append vào cuối `knowledgeRecord`
(`workflow.ts:1613`), remediation `clipText(..., 6_000)` giữ 6.000 ký tự **đầu** (`workflow.ts:1300`,
`parser.ts:158-162`). Lý do trượt bị vứt bỏ trước khi tới model.

**B2 — Ngân sách token của remediation dưới chuẩn của chính dự án.** `maxTokens: 5600` cho output là toàn bộ
nháp 12 phần, trong khi `cleanGenMaxTokens` khuyến nghị ≈ 9.000 token cho bài 1.400 từ. Draft cụt đuôi →
trượt G1 vòng sau → lặp. Nếu cắt sớm hơn nữa (trước mục "khi nào KHÔNG"), `assertFullDraftQuality` ném lỗi
(`quality.ts:445-449`) **trước** `commitTransition` → **lượt đó không được ghi nhận**, không tăng bộ đếm, chỉ
đốt tiền LLM và quay lại soft-retry.

**B3 — Không có bộ nhớ giữa các vòng.** `knowledgeRecord` bị ghi đè bằng review mới mỗi vòng
(`workflow.ts:1211-1212`); prompt không nhận số vòng; `seed: 42` cố định (`nvidia.ts:74`) + `temperature: 0.25`
⇒ ba lần thử gần như là ba bản sao.

**B4 — Ngân sách dùng chung cho ba cổng khác bản chất.** Một lỗi format 9b, một lỗi GOLD_BAR heuristic và một
lỗi nội dung thật đều trừ chung một quỹ 3 lượt.

**B5 — Mỗi vòng xoá kết quả đã đạt.** `factCheck: null` + `cleanPublish: null` + `heroBrief: null` +
strip `FINAL_REVIEW_DONE_MARK` (`workflow.ts:1318-1339`). Một Fact Check đã PASSED bị huỷ và phải chạy lại từ
đầu, với rủi ro lần này lại `FACT_CHECK_FAILED` → kích hoạt **bộ đếm thứ hai** (`MAX_FACT_REMEDIATION_RETRIES`,
`workflow.ts:1362-1386`).

**B6 — Bar bước 8 (85) thấp hơn bar 9b (87/90).** Bài đậu bước 8 ở 85–86 chắc chắn trượt 9b. Cổng rẻ hơn lại
lỏng hơn cổng đắt hơn — sai chiều tối ưu.

**B7 — Mâu thuẫn spec G6 vs ARTICLE_SHAPE.** Xem câu 8, hạng 4.

**B8 (phụ) — `latestArtifactRevision` không lọc theo `workflowRunId`** (`state-machine.ts:319-329`) trong khi
`transitionArticle` đánh số revision **có** lọc theo run (`state-machine.ts:212-219`). Với bài đã reset,
`sourceRevision` ghi vào artifact có thể trỏ sang revision của run cũ. Không gây trượt gate, nhưng làm audit
trail sai.

### 11) Có workflow bị loop hoặc reset state không

**Loop có chặn (đúng thiết kế):**

| Loop | Trần | Nguồn |
|---|---|---|
| remediate ⇄ review bước 8 | 3 | `retry-policy.ts:1` |
| 9b sai format ⇄ 9b | 3 | `retry-policy.ts:3` |
| fact-remediate ⇄ fact check | `MAX_FACT_REMEDIATION_RETRIES` | `workflow.ts:1362-1386` |
| soft-continue phía client sau 9b fail | 2 | `retry-policy.ts:5`, `page.tsx:425-439` |
| soft-continue tổng quát trên trang bài | 16 | `pipeline-config.ts:28` |
| `runFullWorkflowToReview` | 24 step | `runner.ts:319` |

**Loop KHÔNG được tính (rò rỉ ngân sách):** mọi lỗi ném ra **trước** `commitTransition` — `assertFullDraftQuality`,
`assertEngineeringGoldBar`, timeout NVIDIA — đều không tạo transition, nên `remediationAttempts` không tăng.
Client (`page.tsx:445-463`) và cron (`runner.ts:489-521`) sẽ soft-retry. Đây là vòng lặp tốn tiền LLM mà bộ
đếm không nhìn thấy — trần thực tế của nó là 16 (client) hoặc vô hạn theo tick cron cho tới khi tự khỏi.

**Reset state:**

- Mỗi lần remediate: xoá `factCheck`, `cleanPublish`, `heroBrief`, strip `FINAL_REVIEW_DONE_MARK`,
  `REVIEW_DONE_MARK`, `HUMAN_REVIEW_*` (`workflow.ts:1318-1339`). Đây là reset **có chủ đích** nhưng rất đắt.
- `resetWorkflowArticle` (`state-machine.ts:277-317`) cấp `workflowRunId` mới ⇒ **reset toàn bộ mọi bộ đếm**.
  Đây là con đường thoát duy nhất còn hoạt động sau khi exhausted.

**Ngõ cụt thật sự — mốc reset bộ đếm không còn với tới được.** Bộ đếm chỉ lùi khi có transition
`human-review-confirmed` mới (`workflow.ts:1248-1265`). Nhưng `confirmHumanReview` yêu cầu
`isAwaitingHumanReview(article) === true` (`workflow.ts:2226-2228`), tức `knowledgeRecord` phải có
`REVIEW_DONE_MARK` mà **không** có `HUMAN_REVIEW_DONE_MARK` (`human-review.ts:145-154`). Trong khi đó nhánh
re-review-thất-bại lại **luôn** gắn `HUMAN_REVIEW_DONE_MARK` qua `applyHumanReviewToKnowledge`
(`workflow.ts:1187-1196` → `human-review.ts:208`). Kết luận: sau vòng remediation đầu tiên, cổng Human Review
**đóng vĩnh viễn**, editor không thể confirm lại, bộ đếm không thể reset.

Và câu khuyên trong thông báo lỗi cũng không thực hiện được: **`draft12` không có đường sửa tay**. API PATCH
`/api/articles/[id]` chỉ nhận `cleanPublish`, `editNote`, `seriesId`, `seriesOrder`, `publishFormat`
(`web/src/app/api/articles/[id]/route.ts:40-51`); còn `cleanPublish` lúc này đã bị remediation set về `null`.
Trên UI, `draft12` chỉ được render read-only (`page.tsx:131, 746`). **Lối thoát duy nhất là "Làm lại từ đầu".**

### 12) Đề xuất cách sửa nhỏ nhất để tăng tỷ lệ pass

Xếp theo tỷ lệ tác động / chi phí. Tất cả đều là thay đổi tại chỗ, không đổi kiến trúc.

| # | Sửa | File · dòng | Vì sao | Effort |
|---|---|---|---|---|
| **F1** | Nâng clip nháp ở bước 8 từ `7_000` lên `16_000` và thêm `clipText(article.researchBrief, 2_500)` vào CONTEXT | `workflow.ts:1128-1132` | Xoá nguyên nhân gốc của Fail G1 + G3. Không cần đổi logic nào khác | S |
| **F2** | Đổi `maxTokens: 5600` → `cleanGenMaxTokens(article.targetWordCount)` | `workflow.ts:1309` | Dùng lại công thức có sẵn của dự án; chấm dứt draft revision cụt đuôi | S |
| **F3** | Trong CONTEXT remediation, đưa lý do trượt **lên đầu**: thêm `article.errorMessage` + `priorPipelineSupportBlock({...})` và trích riêng section `## Final Verification (pipeline)` thay vì `clipText(knowledgeRecord, 6_000)` | `workflow.ts:1293-1306` | Model đang được yêu cầu sửa theo Required Revisions mà không nhận được chúng. Hàm helper đã tồn tại | S |
| **F4** | Khi `!machineReadable` ở bước 8: xử lý như "sai format" (retry đọc lại, đếm riêng) thay vì suy state từ regex quét toàn văn; nếu vẫn phải suy, mặc định `MINOR` chứ không `REWRITE` | `editorial-review-gate.ts:149-166` | Chặn P1 — leo thang oan lên REWRITE khiến mỗi vòng viết lại từ đầu. 9b đã làm đúng cách này rồi | S |
| **F5** | Nới điều kiện đậu bước 8: cho phép `EDITORIAL_REVIEWED` khi `total ≥ 85 && insight ≥ 20 && gateFailCount ≤ 1` và Fail đó không thuộc {G2, G3, G4} | `editorial-review-gate.ts:84-91` | Bước 8 là cổng *provisional*; 9b mới là cổng thật. Một Fail G6/G7 không đáng tiêu một lượt remediation | S |
| **F6** | Nâng bar bước 8 lên đúng bằng near-miss của 9b (`total ≥ 87`) **hoặc** hạ `nearMissAcceptFloor` xuống 85 | `contract.ts:15, 21` | Xoá vùng chết 85–86 (B6). Chọn một trong hai, không cần cả hai | S |
| **F7** | Tách ngân sách: đếm remediation theo `details.origin` (`editorial-review` / `pre-9b` / `final-verify`), mỗi nguồn 2–3 lượt; hoặc tối thiểu nâng `MAX_REVISION_REMEDIATION_RETRIES` lên 5 | `retry-policy.ts:1`, `workflow.ts:1257-1266` | Hiện ba cổng khác bản chất tiêu chung một quỹ | S–M |
| **F8** | Khi exhausted: mở lại cổng người bằng cách thay `HUMAN_REVIEW_DONE_MARK` bằng `HUMAN_REVIEW_PENDING_MARK` trong `knowledgeRecord` | `workflow.ts:1268-1277` | Trả lại cho editor quyền "chấp nhận rủi ro và đi tiếp", đồng thời khôi phục mốc reset bộ đếm. Hiện tại đây là ngõ cụt | S |
| **F9** | Thêm số vòng vào prompt remediation (`Đây là lần sửa ${n}/${MAX}`) và bỏ `seed: 42` cố định cho các bước remediation | `workflow.ts:1296`, `nvidia.ts:74` | Ba lần thử hiện là ba bản sao; cần đa dạng hoá để retry có ý nghĩa | S |
| **F10** | Làm rõ G6 trong `Review.md`: `G6 Có kết mở/câu hỏi thảo luận **phù hợp với ARTICLE_SHAPE** (shape `skip` ⇒ Pass khi có kết chốt)` | `content/ai-tfes/05-Templates/Review.md:35` | Xoá mâu thuẫn spec khiến bài đúng shape vẫn Fail | S |
| **F11** | Thống nhất machine lines cho pha EDITORIAL_REVIEW: cho `Review.md` biết pha nào dùng `PROVISIONAL_*` | `Review.md:59-66` | Chặn P2 — mất machine lines dẫn tới P1 | S |
| **F12** | Bổ sung unit test cho `inspectEditorialReview` (bảng vs bullet, machine lines thiếu, review có copy enum legend) và `countEditorialGateFails` | `web/src/lib/tfes/editorial-review-gate.test.ts` (mới) | Hiện gate quyết định số phận mọi bài mà không có một test nào | S |

**Nếu chỉ được làm ba việc:** F1 + F2 + F3. Ba thay đổi này xử lý toàn bộ nhóm nguyên nhân "gate chấm trên dữ
liệu không đầy đủ" và "revision không nhận được feedback" — tức phần lỗi *không thể* khắc phục bằng cách viết
bài tốt hơn.

---

## 3. Giới hạn của điều tra này

- **Không truy cập database production.** Toàn bộ kết luận suy ra từ đọc code, prompt và template. Chưa xác
  nhận bằng dữ liệu thật rằng `failureReasons` trong production đúng như dự đoán.
- **Cách xác minh nhanh khi có quyền đọc DB (chỉ SELECT, an toàn):**

  ```sql
  -- Tần suất từng lý do trượt bước 8 và 9b
  SELECT action, details
  FROM "WorkflowTransition"
  WHERE action IN ('editorial-review','editorial-review-after-revision','final-verification',
                   'remediate-required-revision','revision-remediation-exhausted')
    AND "articleId" = '<id bài lỗi>'
  ORDER BY "createdAt";
  ```

  Trường `details` của các transition này chứa nguyên `EditorialReviewInspection` / `FinalVerification`
  (`workflow.ts:1220-1224`, `workflow.ts:1624`), tức có `totalScore`, `insightScore`, `gateFailCount`,
  `machineReadable`, `failureReasons`. Đây là bằng chứng trực tiếp để xác nhận giả thuyết P1/P2 và biết gate
  nào Fail nhiều nhất.

  ```sql
  -- Độ dài draft thực tế so với ngưỡng clip 7.000 ký tự
  SELECT id, length(draft12) AS draft_chars, "workflowState", "errorMessage"
  FROM "Article"
  WHERE "errorMessage" LIKE 'Revision chưa đạt sau%';
  ```

- **Chưa chạy thử end-to-end.** Việc reproduce cần gọi NVIDIA API thật (tốn quota) và đã bị chặn trên Preview
  theo `assertPreviewSideEffectsAllowed` (`nvidia.ts:271`).
- **Không sửa code** theo đúng yêu cầu. Mục 12 chỉ là đề xuất.

---

## 4. Tham chiếu file

| File | Vai trò |
|---|---|
| `web/src/lib/tfes/workflow.ts` | Executor pipeline; `finalizePhaseOf` (459-491), review (1119-1236), await-human (1239-1245), revision-remediate (1247-1358), fact-remediate (1361-1442), fact (1445-1503), 9b (1506-1636), `confirmHumanReview` (2220-2293) |
| `web/src/lib/tfes/editorial-review-gate.ts` | Gate máy bước 8 |
| `web/src/lib/tfes/final-verification.ts` | Gate máy 9b |
| `web/src/lib/tfes/human-review.ts` | Parse findings, cổng người, `applyHumanReviewToKnowledge` |
| `web/src/lib/tfes/retry-policy.ts` | Trần retry + nhận diện exhausted |
| `web/src/lib/tfes/contract.ts` | Ngưỡng điểm |
| `web/src/lib/tfes/prompts.ts` | Prompt bước 8 (389-419), remediation (453-466), 9b (468-499) |
| `web/src/lib/tfes/parser.ts` | Marks, `clipText`, `extractEditorialReview` |
| `web/src/lib/tfes/quality.ts` | `assertFullDraftQuality`, `cleanGenMaxTokens` |
| `web/src/lib/tfes/engineering-gold-bar.ts` | Pre-9b GOLD_BAR |
| `web/src/lib/tfes/state-machine.ts` | Transition hợp lệ, artifact, reset run |
| `web/src/lib/tfes/pipeline-config.ts` | Knobs số từ / token / retry |
| `web/src/lib/nvidia.ts` | LLM client (`seed: 42`, parse SSE bỏ `reasoning_content`) |
| `web/content/ai-tfes/05-Templates/Review.md` | Template checklist G1–G8 + machine lines |
| `web/src/app/articles/[id]/page.tsx` | Soft-continue phía client |
| `web/src/lib/auto-write/runner.ts` | Tick auto-write, `isAutoWorkflowDone` |

---

## 5. Implementation status sau WP2.5 / WP2.6

> Phần điều tra phía trên được giữ nguyên làm baseline lịch sử. Trạng thái dưới đây là nguồn cập nhật sau khi implement.

| Finding | Trạng thái | Bằng chứng |
|---|---|---|
| F1 — bước 8 thiếu full draft/Research Brief | **Fixed · Verified by test** | WP2.5: `reviewDraftClipChars()` + Research Brief context |
| F2 — revision remediation hard-code 5.600 token | **Fixed · Verified by test** | WP2.5: `cleanGenMaxTokens(article.targetWordCount)` |
| F3 — Required Revisions nằm cuối và bị prefix-clip | **Fixed · Verified by test** | WP2.5: `buildRevisionFeedbackBlock()` + `priorPipelineSupportBlock()` |
| 9b chỉ đọc 7.000 ký tự draft | **Fixed · Verified by test** | WP2.6: dùng cùng `reviewDraftClipChars()` |
| Fact remediation hard-code 5.200 token | **Fixed · Verified by test** | WP2.6: dùng `cleanGenMaxTokens()` |
| P1 — fallback quét enum toàn văn | **Fixed · Verified by test** | Exact machine-line parser; malformed → parse failure/MINOR an toàn |
| P2 — prompt/template trộn `PROVISIONAL_*` và `FINAL_*` | **Fixed · Verified by test** | Template không khai báo key; mỗi phase sở hữu một contract |
| P3 — gate parser bỏ sót Markdown table | **Fixed · Verified by test** | Shared `parseEditorialGateFailures()` |
| P4 — Human Review lấy header làm finding | **Fixed · Verified by test** | Header/separator/PASS filter + shared gate parser |
| F7 — retry budget dùng chung | **Deferred** | Ngoài phạm vi WP2.6 |
| F8 — Human Review đóng sau remediation / counter không reset | **Deferred** | Ngoài phạm vi WP2.6 |
| Không có đường sửa tay `draft12` | **Deferred** | Work Package sau |

**Needs production validation:** chạy lại một bài từng exhausted, kiểm tra transition details, số lượt remediation,
độ đầy đủ của artifact draft và `llmMs`. Không coi unit test là bằng chứng rằng model production chắc chắn pass.
