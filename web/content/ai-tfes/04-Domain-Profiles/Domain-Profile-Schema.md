# Domain Profile — Schema chuẩn v1.6 (checklist)

> Mọi Domain Profile mới (kể cả 5 domain hiện có) phải khai đủ các trường dưới đây, theo đúng thứ tự, để agent web parse nhất quán. `engineering.md` là hồ sơ gốc — domain khác chỉ khai phần **khác biệt**; nếu một trường không khác, domain đó kế thừa nguyên văn từ `engineering.md`.

## Trường bắt buộc

| Trường | Bắt buộc? | Mục đích | Dùng ở bước nào |
|---|:---:|---|---|
| `identity` | ✅ | 1–2 câu định vị nội dung domain | Toàn pipeline (context) |
| `audience` | ✅ | Ai đọc, nền tảng giả định | Planning, Writing |
| `tone` | ✅ | Giọng văn, điều cấm | Writing, Review |
| `source_tiers` | ✅ | Tier 1–5, quyết định nguồn nào dùng được để kết luận | Research, Fact Check |
| `example_strategy` | ✅ | Loại ví dụ nên dùng, loại nên tránh | Writing (Real-world Examples) |
| `categories` | ✅ | Danh sách category hợp lệ cho domain | Editorial Decision |
| `scoring_weights` | ✅ | **Ưu tiên chủ đề/góc** — KHÔNG dùng để chấm bài (xem Operating Prompt mục 3) | Editorial Decision (Bước 5) |
| `sensitivity` | ✅ | Ràng buộc đạo đức/pháp lý riêng domain (nếu có) | Insight Gate, Review |
| `freshness` | ✅ | Cửa sổ thời gian hợp lệ cho thông tin loại nào | Research |
| `seed_topics` | ✅ | Ngân hàng chủ đề khởi động khi chưa có brief | Editorial Memory, Decision |
| `gold_samples` | ✅ (≥2) | Mẫu "hay" để bắt chước nhịp/mở bài, KHÔNG copy nguyên văn | Writing |
| `learning_track_seed` | tuỳ chọn | Lộ trình học gợi ý nếu domain có tính chuỗi bài | Planning (dài hạn) |
| `pseudoscience_blocklist` / blocklist tương đương | tuỳ chọn, bắt buộc nếu domain có rủi ro giả khoa học (VD: soft-skills) | Danh sách điều không được trình bày như sự thật | Insight Gate, Fact Check |

## Nguyên tắc viết `gold_samples`

Mỗi mẫu gồm 3 dòng:
- **Mở:** một câu hook cụ thể (quan sát/nghịch lý/tình huống — không định nghĩa, không mở bài sáo rỗng).
- **Nhịp:** story arc ngắn (cảnh → cơ chế/insight → mini-case → khi nào KHÔNG nên → hệ quả/câu hỏi mở).
- **Tránh:** liệt kê rõ kiểu mở/kiểu liệt kê cần tránh cho chủ đề đó.

Khuyến nghị ≥2 mẫu/domain để có đủ đa dạng giọng khi Writing tham chiếu.

## Tình trạng 5 domain hiện có (audit nhanh)

| Domain | Có đủ trường bắt buộc? | Ghi chú |
|---|---|---|
| `engineering.md` | ✅ | Hồ sơ gốc, đầy đủ, 3 gold_samples |
| `soft-skills.md` | ✅ | Có thêm `pseudoscience_blocklist` + `learning_track_seed`, 2 gold_samples |
| `ai-ml.md` | Đã bổ sung `gold_samples` (xem file cập nhật) | Trước đây thiếu |
| `product.md` | Đã bổ sung `gold_samples` (xem file cập nhật) | Trước đây thiếu |
| `security.md` | Đã bổ sung `gold_samples` (xem file cập nhật) | Trước đây thiếu |


## Runtime contract v1.6

- Backend phải resolve inheritance trước khi gọi LLM và gắn `domain_profile_version`.
- `scoring_weights` phải là số nguyên, không âm, tổng đúng 100.
- `gold_samples` chỉ dùng để học nhịp; cấm sao chép số liệu, cấu trúc câu, incident hoặc thứ tự story arc.
- Không dùng số cụ thể trong hook nếu không đến từ research hoặc dữ liệu người dùng.
- Validator phải fail khi thiếu field bắt buộc, enum sai hoặc tổng trọng số khác 100.
