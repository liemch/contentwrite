# CHANGELOG — AI-TFES v1.4 → v1.5

Tổng hợp toàn bộ thay đổi trên bộ file `.md`, kèm lý do. Dùng để review trước khi merge vào website — không có thay đổi nào phá vỡ cấu trúc field hiện có (không đổi tên field trong Domain Profile, chỉ thêm ghi chú + trường còn thiếu).

## 1. Sửa lỗi nghiêm trọng: 3 rubric khác nhau đang tồn tại song song

**Trước:** Operating Prompt §9 dùng 6 tiêu chí (Insight Depth 30 · Evidence 20 · Writing Craft 20 · Practical Value 15 · Intellectual Honesty 10 · Structure & Flow 5); `Review.md` dùng 8 tiêu chí khác hoàn toàn (Technical/Evidence Accuracy 20 · Logical Structure 15 · Clarity 15 · Insight Quality 15 · Practical Value 15 · Readability 10 · Discussion Potential 5 · Originality 5); mỗi Domain Profile lại có `scoring_weights` riêng (7 tiêu chí khác nữa). Không rõ khi chạy Bước 8 thì dùng bảng nào.

**Sau:**
- `Review.md` giờ dùng **đúng và chỉ** bảng 6 tiêu chí của Operating Prompt §9 (file: `Review.md`, `Operating-Prompt-v1.5.md`).
- `scoring_weights` của Domain Profile được ghi rõ mục đích: **ưu tiên chủ đề/góc ở Bước 5 (Editorial Decision)**, không dùng để chấm bài viết. Ghi chú này được thêm vào cả 5 file domain + Operating Prompt §2, §3, §9.

**Vì sao quan trọng:** nếu không hợp nhất, hai bài cùng chất lượng có thể ra điểm khác nhau tùy AI "ngẫu nhiên" chọn bảng nào — phá vỡ tính nhất quán của quy trình review.

## 2. Làm rõ "Insight check" trong `Review.md`

**Trước:** ghi "Insight chính (≥3)" — mâu thuẫn với Insight Gate (chỉ có **một** luận điểm trung tâm L0–L3).

**Sau:** đổi thành "Insight trung tâm (đã qua Gate)" + "quan sát/insight phụ minh hoạ (0–2, không bắt buộc)" — khớp với cơ chế Gate ở Operating Prompt.

## 3. Thêm 2 template được tham chiếu nhưng chưa tồn tại

- **`Knowledge-Record.md`** — được nhắc ở Bước 10 và mục Output #5 của Operating Prompt v1.4, nhưng chưa có file. Đã tạo, gồm: định danh bài, luận điểm trung tâm, "dấu vân tay nội dung" (phục vụ Editorial Memory chống trùng), tóm tắt claim theo FactCheck, bài liên quan, và `retraction_status` (khớp vòng lặp với Correction).
- **`Domain-Profile-Schema.md`** — chuẩn hoá field bắt buộc/tuỳ chọn cho Domain Profile (trước đây `ai-ml.md`/`product.md`/`security.md` thiếu `gold_samples` so với `engineering.md`/`soft-skills.md`, không ai định nghĩa field nào là bắt buộc).

## 4. Gắn `Correction.md` vào pipeline chính thức

**Trước:** `Correction.md` tồn tại độc lập, không được Operating Prompt nhắc tới ở đâu — không rõ khi nào kích hoạt, ai gọi bước này.

**Sau:** thêm Bước **10d — Post-publish: Correction/Retraction** vào bảng pipeline (Operating Prompt §4, §7, §8, §10), với điều kiện kích hoạt rõ ràng (báo lỗi người đọc / fact-check follow-up / audit nội bộ) và yêu cầu cập nhật hai chiều: `Correction.md` ↔ `Knowledge-Record.md` (`retraction_status`) ↔ `Publish.md` ("Correction History"). Đã thêm các dòng liên kết chéo vào cả 3 file này.

## 5. Chốt cách đếm "nháp 12 phần" của `Article.md`

**Trước:** liệt kê 13 heading (Title, Subtitle, Metadata, Executive Summary...References) nhưng gọi là "12 phần" — không rõ heading nào bị loại trừ.

**Sau:** chốt công thức — Metadata **không** tính (là khai báo, không phải nội dung); Practical Recommendations tính là **1** phần dù có 3 khối con → đúng 12. Đã thêm comment giải thích ngay đầu `Article.md` và một đoạn tương ứng ở Operating Prompt §5A.

## 6. Bổ sung `gold_samples` còn thiếu

`ai-ml.md`, `product.md`, `security.md` trước đây không có mục `gold_samples` (trong khi `engineering.md` có 3 mẫu, `soft-skills.md` có 2 mẫu) — nghĩa là khi Writing chạy ở 3 domain này, AI không có mẫu nhịp/mở bài để bám. Đã viết thêm 2 mẫu/domain, bám theo đúng `seed_topics` đã khai báo sẵn của từng domain, theo cùng công thức Mở/Nhịp/Tránh.

## 6b. Lỗi ngoặc kép ngoài ý muốn (phát hiện khi đối chiếu file gốc)

Bản v1.5 đầu tiên của 5 file domain đã vô tình đổi dấu ngoặc kép in ấn (`“ ”`, `‘ ’`) trong toàn bộ nội dung gốc thành ngoặc thẳng (`" '`) — không chỉ ở phần thêm mới. Đã đối chiếu byte-by-byte với bản gốc và khôi phục đúng kiểu ngoặc cho mọi câu chữ có sẵn; phần nội dung mới (ghi chú `scoring_weights`, `gold_samples` mới) cũng đổi sang cùng kiểu ngoặc để nhất quán.

## 7. `Research-Brief.md` — phát hiện muộn sau audit ban đầu (bổ sung theo yêu cầu đối chiếu thêm)

Ba điểm bị bỏ sót ở lần audit đầu (lúc đó bị đánh giá nhầm là "không đổi"):

- **`Domain:` liệt kê thiếu** — vẫn ghi `<engineering | soft-skills>`, thiếu 3 domain đã có (`ai-ml`, `product`, `security`). Đã cập nhật đủ 5.
- **`Insights (≥3, mỗi insight có nguồn)` mơ hồ giống lỗi đã sửa ở `Review.md`**, nhưng tinh vi hơn: Research Brief nằm **trước** Insight Gate trong pipeline, nên về logic 3 insight này phải là **insight ứng viên** (nguyên liệu thô cho Gate chọn), không phải luận điểm trung tâm đã chốt. Đã thêm ghi chú phân biệt rõ với "Insight trung tâm" trong `Review.md` (khái niệm đó là insight **đã qua Gate**).
- **Thiếu liên kết hai đầu pipeline:** chưa nhắc Editorial Memory (Bước 1 — đối chiếu `Knowledge-Record.md` để tránh trùng) ở đầu, và chưa nhắc `scoring_weights` domain (Bước 5) ở phần Candidate Titles. Đã thêm cả hai.

## Danh sách file trong bộ v1.5

| File | Trạng thái |
|---|---|
| `Operating-Prompt-v1.5.md` | Cập nhật (thay `Operating-Prompt-v1.4.md`) |
| `Review.md` | Cập nhật |
| `Article.md` | Cập nhật (chỉ thêm comment, không đổi cấu trúc) |
| `Publish.md` | Cập nhật (thêm 2 field liên kết) |
| `Correction.md` | Cập nhật (thêm liên kết Knowledge Record) |
| `Knowledge-Record.md` | **Mới** |
| `Domain-Profile-Schema.md` | **Mới** |
| `FactCheck.md` | Không đổi (copy nguyên trạng để bộ đủ file) |
| `Research-Brief.md` | Cập nhật (domain list, làm rõ Insights = ứng viên, gắn Editorial Memory + scoring_weights) |
| `engineering.md` | Cập nhật (chỉ thêm ghi chú `scoring_weights`) |
| `soft-skills.md` | Cập nhật (chỉ thêm ghi chú `scoring_weights`) |
| `ai-ml.md` | Cập nhật (thêm ghi chú + 2 `gold_samples`) |
| `product.md` | Cập nhật (thêm ghi chú + 2 `gold_samples`) |
| `security.md` | Cập nhật (thêm ghi chú + 2 `gold_samples`) |

## Chưa xử lý / cần bạn quyết định thêm

- Chưa đổi tên field `scoring_weights` → tên rõ nghĩa hơn (VD: `topic_priority_weights`) để tránh nhầm rubric review trong tương lai — **không đổi** vì có thể phá vỡ mapping field trên website hiện tại. Nếu muốn đổi, cần cập nhật đồng bộ phía parser web.
- Chưa có domain profile riêng cho các category nào khác ngoài 5 domain hiện có — nếu web sắp thêm domain mới, dùng `Domain-Profile-Schema.md` làm checklist.
- Chưa viết `learning_track_seed` cho `engineering`, `ai-ml`, `product`, `security` (hiện chỉ `soft-skills` có) — có thể cân nhắc thêm nếu web dùng field này để gợi ý chuỗi bài học.
