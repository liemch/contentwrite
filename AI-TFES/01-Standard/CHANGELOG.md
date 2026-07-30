# CHANGELOG — AI-TFES

## ★ RELEASE 1.0 — bản phát hành hoàn chỉnh
Bộ hoàn chỉnh đầu tiên, đã tích hợp trọn vòng chất lượng:
- **Insight Gate** (Bước 2): chỉ viết chủ đề hứa hẹn được insight ≥ L2, không viết vì "đang hot".
- **Bar Viết** (Bước 3): hook, nhịp câu, chống văn mẫu, trung thực trí tuệ, kết mở; đặt insight sớm & bạo dạn.
- **Operating Prompt v1.0** (SHORT + full) đã tích hợp cả hai, calibrate theo Quality Standard v1.0.
- Thành phần: Spec v2.2 (25 module) · Quality Standard v1.0 · Operating Prompt v1.0.

---


Nhật ký phiên bản của bộ đặc tả và prompt vận hành. Cập nhật mỗi khi sửa spec hoặc prompt (Module 22.4).

## Spec

### v2.2 — Extended Edition (hiện tại)
- Thêm **Module 25 — Visual & Media Layer**: ảnh chính (hero) để thu hút người đọc + visual mang thông tin (Mermaid/bảng); cấm hình ảnh đánh lừa, bắt buộc caption + alt text.
- Tổng: 25 Modules + 3 Phụ lục.

### v2.1 — Extended Edition
- Thêm **Module 23 — Domain Profile & Adaptation Layer**: tách phần phụ thuộc miền khỏi bộ máy lõi.
- Thêm **Module 24 — Learning Path & Curriculum Engine**: thiết kế lộ trình học cho nội dung rèn luyện.
- Thêm **Phụ lục C**: hồ sơ miền "Kỹ năng mềm cho đội ngũ kỹ thuật".
- Tổng: 24 Modules + 3 Phụ lục.

### v2.0 — Operational Extension
- Thêm Module 17–22: State & Storage, Grounded Fact Verification, Human Oversight & Correction, Anchored Scoring Rubrics, Security & Prompt-Injection Defense, System Operations & Governance.

### v1.0 — Foundation
- Module 1–16: triết lý biên tập, workflow, calendar, research engine, decision, planning, generation, review, fact-check, knowledge base, publishing, continuous learning, reasoning framework, universal spec, universal prompt, governance + 2 phụ lục.

## Standards
- **Quality Standard v1.0** — Chuẩn phân biệt "bài đạt" vs "bài hay", trục là insight sâu (thang L0–L3, 3 bài test insight), các bar viết (hook/nhịp/trung thực/kết mở), bài mẫu vàng có chú thích, và rubric chấm điểm mới (Insight Depth nặng nhất). Nền tảng để nâng chất lượng đầu ra.

## Operating Prompt
- **v1.0 (Release)** — tích hợp Insight Gate + Bar Viết + rubric mới (Insight Depth nặng nhất). Viết lại gọn, calibrate theo Quality Standard.
- **v2.3** — thêm chỗ giữ chỗ ẢNH CHÍNH + informational visual (Mermaid/bảng) vào bản sạch, và mục "HERO IMAGE BRIEF" (Module 25).
- **v2.2** — thêm Mục 6 "BẢN SẠCH ĐỂ ĐĂNG" (Module 11): mỗi lần chạy tự xuất một bản xuất bản đã đổi nhãn Section thành tiêu đề tự nhiên và gỡ log/markup, để copy-paste đăng ngay. Áp dụng cho cả bản đầy đủ và bản SHORT.
- **v2.1** — khớp spec v2.1; thêm mục Domain Profile selection.

## Ghi chú
Khi đổi thế hệ model (ví dụ nâng cấp LLM), chạy lại một bộ bài mẫu để kiểm tra chất lượng không tụt trước khi đưa vào vận hành (Module 22.5).
