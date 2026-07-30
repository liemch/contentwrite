# AI-TFES — RELEASE 1.0 (bản phát hành hoàn chỉnh)

> Đây là bộ AI-TFES hoàn chỉnh, đã tích hợp Chuẩn Chất Lượng (insight-first), Insight Gate và Bar Viết. Thành phần: Spec v2.2 · Quality Standard v1.0 · Operating Prompt v1.0. Đọc mục "Bắt đầu trong 6 bước" bên dưới để chạy.

---

# AI-TFES — Project Package

Bộ vận hành hoàn chỉnh cho **AI Tech Forum Editorial System (AI-TFES)** — một hệ thống biên tập dùng AI để tạo ra các bài viết kỹ thuật (hoặc kỹ năng mềm) chất lượng cao, có kiểm chứng, cho diễn đàn/nội bộ đội ngũ.

> Đọc file này trước tiên. Nó giải thích mỗi thư mục dùng làm gì và cách bắt đầu.

---

## Mô hình 3 lớp (nguyên tắc nền tảng)

| Lớp | File trong gói | Vai trò |
|-----|----------------|---------|
| **1 · Đặc tả** | `01-Standard/` | Bản thiết kế + hướng dẫn. Để hiểu & tra cứu — KHÔNG dán làm prompt. |
| **2 · Prompt vận hành** | `02-Prompts/` | Thứ AI đọc mỗi lần chạy. Đây mới là cái điều khiển AI. |
| **3 · Bộ nhớ + khuôn** | `03-State/`, `05-Templates/` | Trạng thái tồn tại qua thời gian + khuôn đầu ra. |
| **Cấu hình miền** | `04-Domain-Profiles/` | Đổi hồ sơ = đổi lĩnh vực (kỹ thuật ↔ kỹ năng mềm). |

---

## Cấu trúc thư mục

```
AI-TFES/
├── 00-README.md                  ← bạn đang đọc
├── 01-Standard/
│   ├── AI-TFES-v2.2.pdf           ← bộ đặc tả 25 module (tra cứu)
│   ├── Usage-Guide.pdf            ← hướng dẫn sử dụng
│   ├── Quality-Standard.pdf       ← chuẩn chất lượng + bài mẫu vàng (đọc trước khi chạy)
│   └── CHANGELOG.md               ← nhật ký phiên bản
├── 02-Prompts/
│   ├── Operating-Prompt.md        ← system prompt (dán vào Project/GPT)
│   ├── Daily-Task.md              ← lệnh chạy 1 bài mỗi ngày
│   ├── Weekly-Review.md           ← đánh giá tuần
│   └── Monthly-Audit.md           ← kiểm toán tháng
├── 03-State/                      ← bộ nhớ ngoài (Module 17)
│   ├── Editorial-Calendar.xlsx
│   ├── Knowledge-Base.xlsx
│   ├── Source-Catalog.xlsx
│   └── Topic-Backlog.xlsx
├── 04-Domain-Profiles/
│   ├── engineering.md
│   └── soft-skills.md
└── 05-Templates/
    ├── Research-Brief.md
    ├── Article.md
    ├── Review.md
    ├── FactCheck.md
    ├── Publish.md
    └── Correction.md
```

---

## Bắt đầu trong 6 bước (Lộ trình không-code)

1. Tạo một **Project** (Claude Project / ChatGPT Custom GPT / Gemini Gem).
2. Dán toàn bộ nội dung `02-Prompts/Operating-Prompt.md` vào phần **chỉ dẫn hệ thống**.
3. Tải vào phần *knowledge/tài liệu* của Project: `01-Standard/AI-TFES-v2.2.pdf` và hồ sơ miền bạn chọn trong `04-Domain-Profiles/`.
4. **Bật web search** cho Project (bắt buộc — không có thì AI sẽ bịa nguồn).
5. Mở `03-State/*.xlsx`, dán trạng thái hiện có (hoặc để trống nếu mới bắt đầu) vào đầu cuộc trò chuyện.
6. Dán `02-Prompts/Daily-Task.md` để chạy bài đầu tiên. Duyệt tại cổng → dán Knowledge Record trở lại `Knowledge-Base.xlsx`.

---

## Lưu ý vận hành quan trọng

- **AI không tự ghi vào file .xlsx.** Nó chỉ *đọc* bản bạn tải lên (snapshot). Sau mỗi bài, AI xuất ra một bản ghi dạng text → **bạn tự dán vào sheet** → tải lại file khi cần AI thấy bản mới. Đây là bình thường ở Level 1–2.
- **Luôn có người duyệt** trước khi coi là "đã xuất bản" (Module 19).
- Bắt đầu nhỏ. Giá trị tích lũy dần khi `Knowledge-Base` lớn lên.
