# Publish Package — <Title>

> Bước Publish Ready biến **nháp 12 phần (nội bộ)** thành **bài đăng cho mọi người đọc**.
> Chỉ khối `=== BẢN SẠCH ĐỂ ĐĂNG ===` được copy-paste đi đăng. Mọi mục khác = nhật ký biên tập.

---

## 0) Nguyên tắc xuất bản (đọc trước khi viết bản sạch)

1. **Viết LẠI, không copy skeleton.** Nháp Article.md là nguyên liệu; bản sạch là sản phẩm đọc liền.
2. **Một luận điểm xuyên suốt** (insight ≥ L2 đã chốt ở Gate) — đặt sớm ở đoạn mở, không chôn cuối bài.
3. **Giọng engineering:** cụ thể (cơ chế, ràng buộc, failure mode) thắng trừu tượng / slide consulting.
4. **Trung thực trí tuệ:** có điều kiện áp dụng + phản biện thật + thừa nhận điều chưa biết; số liệu khớp Fact-Check.
5. **Prefs bài thắng mặc định:** tôn trọng target word count và avoid-formats (table / mermaid / numbered_outline).

### Test nhanh “bài HAY” (self-check trước STATUS)
- [ ] Senior đọc đoạn mở có **khựng lại** không? (insight không hiển nhiên)
- [ ] Độc giả biết **làm gì khác đi** sau khi đọc? (So what)
- [ ] Bỏ hết heading — bài vẫn đọc được một mạch không?
- [ ] Có chỗ nói rõ **khi nào không nên / chỉ khi / không phù hợp** không?

---

## Metadata (bắt buộc — nội bộ, KHÔNG dán vào bài đăng)

| Field | Giá trị |
|-------|---------|
| Article ID | |
| Version | 1.0 |
| Publish Date | YYYY-MM-DD |
| Domain / Category | |
| Tags / Keywords | 5–12 từ khóa |
| Author (Human Owner) | |
| Reviewer / Approver | |
| Review Status | Approved / Pending |
| Reading Time / Difficulty | ~N' · Beginner / Intermediate / Advanced / Leadership |
| Target word count (bản sạch) | vd. 1200 (±15%) |
| Avoid formats | table · mermaid · numbered_outline · — |

---

## 5) Knowledge Record (nội bộ — trước bản sạch)

Điền đủ, ngắn, có thể index vào thư viện. **Không** đưa khối này vào bài đăng.

- **Title:** (trùng title bản sạch, không L2)
- **Category:**
- **Domain:** engineering | soft-skills
- **Keywords:**
- **Core Message:** 1–2 câu = insight L2/L3 đã chốt (“X đúng, NHƯNG chỉ khi Y”)
- **Key Insights:** (3–5, mỗi ý 1 dòng + nguồn ngắn)
  1.
  2.
  3.
- **Trade-off chính:** (1 dòng)
- **Khi nào KHÔNG / giới hạn:** (1 dòng)
- **References:** URL đã dùng (khớp Research + Fact-Check)
- **Related / tránh trùng:** bài/kho gần đây (nếu có)
- **Evergreen:** 1–5 · **Editorial Score:** /100 · **Date:**

---

## 6) === BẢN SẠCH ĐỂ ĐĂNG ===

> Marker bắt buộc đúng dòng: `=== BẢN SẠCH ĐỂ ĐĂNG ===`
> Ngay bên dưới là **toàn bộ** bài đăng — không log, không bảng điểm Review, không Knowledge Record.

### A. Khung bài đọc liền (bắt buộc — **chọn 1 biến thể**, không copy khuôn mọi bài)

Pipeline gán **ARTICLE_SHAPE** theo bài (paradox-deepdive · failure-postmortem · debate-two-sides · narrative-case · question-led · field-note). Bản sạch phải theo nhịp shape đó.

- CẤM dòng gạch ngang markdown `---` / `***` giữa các đoạn trong body (dùng `##` hoặc câu cầu nối).
- CẤM mọi bài cùng công thức: cảnh mở → tension → cơ chế → mini-case → guardrail → 3 câu hỏi thảo luận + khuyến nghị Cá nhân/Team/Tổ chức.

```markdown
# <Title — <80 ký tự, không giật tít, không (L2)/(L3)>

*<Phụ đề 20–40 từ — lead báo, không nhãn Subtitle>*

![<mô tả ngắn chủ đề bằng tiếng Việt>](HERO_IMAGE)

<Đoạn mở theo shape: cảnh / sự cố / câu hỏi / đội+áp lực… — insight sớm có điều kiện>

## <Tiêu đề đọc được #1 — wording đa dạng, không lặp cụm sáo giữa các bài>
...

## <Tiêu đề đọc được #2>
...

## <… thêm ## theo nhịp shape — không bắt buộc đúng 3 mục>

<Kết theo shape: hệ quả / bài học hẹp / câu hỏi đúng hơn — KHÔNG tóm tắt lại toàn bài>

### Câu hỏi thảo luận
(chỉ khi shape yêu cầu hoặc thật sự kích thảo luận — có thể bỏ)

## References
1. <Tên — “…” — URL>
2.
```

### B. Gợi ý tiêu đề thân bài (ĐỌC ĐƯỢC — chọn/đổi theo góc + shape)

Dùng `##` tự nhiên. **CẤM** copy tên section Article.md. **CẤM** lặp cùng cụm heading ở mọi bài (“Ba rủi ro cần nhìn thẳng”, “Khi nào nên dừng”…).

| Thay vì (biên tập) | Dùng kiểu (đăng tin) — ví dụ, đổi theo bài |
|--------------------|---------------------------------------------|
| Introduction / Context | Cảnh kỹ sư hay gặp · Đêm sự cố · Câu hỏi đội hay đặt |
| Problem Statement | Điểm mù · Cuộc cãi trong PR · Quyết định tuần này |
| Deep Analysis | Cơ chế đằng sau · Hai phe · Root cause không phải thứ nghĩ ban đầu |
| Real-world Examples | Case xuyên suốt · Timeline ngắn · Anti-pattern hiện trường |
| Practical Recommendations | Việc làm được · Khi nào dừng · Tín hiệu nhận biết |
| Executive Summary / Key Takeaways | (gộp vào mở + kết — không tách mục tóm tắt giữa bài) |

### C. Nhịp & nghề viết (BAR VIẾT — bản sạch)

- Insight L2/L3 **sớm** (đoạn mở), không “để dành” đoạn cuối.
- Xen câu ngắn chốt sau vài câu dài; tránh mọi đoạn khuôn 3 câu.
- Cụ thể thắng trừu tượng: tên lớp lỗi, bước pipeline, ràng buộc auth/data — không % bịa, không “YC Survey” không có trong Research.
- Sáo ngữ CẤM: “trong thời đại ngày nay”, “không thể phủ nhận”, “đóng vai trò quan trọng”, “Trong thế giới…”.
- Mỗi `##` phải **đẩy** luận điểm đi một bước (cầu nối: “điểm mù…”, “vì vậy…”, “trade-off thật…”).
- Kết: câu hỏi / hệ quả mở — không bullet “tóm lại những gì đã học”.

### D. CẤM trên bản sạch (tick trước khi STATUS)

**Hình thức**
- [ ] Heading biên tập: Introduction · Context · Problem Statement · Deep Analysis · Real-world Examples · Practical Recommendations · Executive Summary · Key Takeaways · Metadata
- [ ] Outline listicle: `1. Hook` / `2. Khi nào nên` / Decision Framework / đánh số 1–11 kiểu checklist marketing
- [ ] Meta: `Insight L2:`, “Gate đạt…”, “theo Domain Profile…”, Knowledge Record
- [ ] Dòng chữ `alt` trần; `![alt](HERO_IMAGE)` — phải là mô tả thật
- [ ] Table / Mermaid khi prefs cấm
- [ ] Placeholder / TODO / Draft note / `STATUS` nằm giữa body

**Nội dung**
- [ ] Đọc một mạch — không reset tóm tắt giữa các đoạn
- [ ] Có điều kiện / phản biện (không nên · chỉ khi · không phù hợp · hạn chế khi)
- [ ] Độ dài ~ target (±15%)
- [ ] ≥1 ví dụ kỹ thuật cụ thể (không “Công ty ABC/XYZ”)
- [ ] Mọi số liệu / survey có trong Research hoặc gắn Opinion rõ
- [ ] References chỉ URL đã đọc — không bịa paper / blog

### E. Checklist chất lượng đăng (Pass hết mới Publish Ready)

| # | Tiêu chí | Pass? |
|---|----------|:-----:|
| P1 | Hook kéo được người đọc kỹ thuật | |
| P2 | Insight ≥ L2 lộ rõ ở mở bài | |
| P3 | Thân bài liền mạch, tiêu đề đọc được | |
| P4 | Có “khi nào không / chỉ khi” thật | |
| P5 | Ví dụ đủ xương (ràng buộc kỹ thuật) | |
| P6 | Không listicle / không heading biên tập | |
| P7 | Fact & URL khớp ledger | |
| P8 | Độ dài & avoid-formats đúng prefs | |

---

## Hình ảnh & HERO IMAGE BRIEF (sau bản sạch — khối riêng)

### Hero đã gen / sẽ gen
- Đường dẫn:
- Alt:
- Caption:
- Nguồn / tín dụng: Ảnh minh họa (AI) | …
- [ ] Không số liệu giả / người thật / logo thương hiệu trong ảnh
- [ ] Không biểu đồ có bản quyền

### HERO IMAGE BRIEF (xuất riêng, không nhét vào body bài)

```text
HERO IMAGE BRIEF
Concept: <1 câu — metaphor đúng luận điểm bài, không generic>
Prompt (English): "<editorial illustration of THIS article's thesis/metaphor; soft lighting; no text/numbers/charts/logos/real people>"
Caption: <tiếng Việt, 1 câu>
Alt: <tiếng Việt, mô tả ngắn cho a11y>
```

CẤM prompt sáo không dính bài: “abstract futuristic tech / circuit boards / glowing code” trừ khi đúng chủ đề hạ tầng đó.

---

## Publishing Checklist (người duyệt)

- [ ] Editorial Review đạt (hoặc Minor đã xử lý)
- [ ] Fact-Check Passed / Minor đã sửa trên bản sạch
- [ ] Bản sạch = đọc liền (P1–P8)
- [ ] Hero OK hoặc có placeholder `HERO_IMAGE` hợp lệ
- [ ] Approver + timestamp

### Distribution (tuỳ chọn ghi chú)
- [ ] Forum / Blog (Markdown)
- [ ] Slack / Teams
- [ ] Confluence / Knowledge Base
- [ ] PDF Archive

---

**Dòng cuối pipeline (bắt buộc):**

`STATUS: Publish Ready — chờ người duyệt`
