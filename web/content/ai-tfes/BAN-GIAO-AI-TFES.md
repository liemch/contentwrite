# BÀN GIAO DỰ ÁN — AI-TFES (Release 1.0)
> Dán TOÀN BỘ file này vào tin nhắn đầu tiên của cuộc trò chuyện mới. Kèm theo, tải lên lại các file lẻ ở Mục 3 (file KHÔNG tự chuyển giữa các tài khoản/session). Sau đó điền Mục 6 để nói rõ việc muốn làm tiếp.

---

## 0. Gửi AI ở cuộc trò chuyện mới — đọc trước
Đây là bản bàn giao một dự án đang vận hành. Hãy đọc để nắm bối cảnh, **tuân thủ các quy ước ở Mục 4**, và tiếp tục từ Mục 5. Trả lời bằng tiếng Việt, xưng "em" gọi người dùng là "anh" (giữ cho liền mạch, tùy chọn).

**Về file đính kèm (quan trọng):** nếu tôi tải lên `AI-TFES.zip`, bạn chỉ đọc được bên trong nếu môi trường có code execution — khi đó hãy giải nén và đọc `00-README.md` trước. Nếu KHÔNG có code execution, hãy yêu cầu tôi tải lên các file lẻ cần thiết (ít nhất `AI-TFES-v2.2.pdf`, `Quality-Standard.pdf`, `Operating-Prompt-SHORT.md`). Cấu trúc thư mục đầy đủ ở Mục 3.

## 1. Dự án là gì
AI-TFES (AI Tech Forum Editorial System) là một hệ thống dùng AI để sản xuất bài viết kỹ thuật (và kỹ năng mềm) **chất lượng cao, có kiểm chứng nguồn**, cho một diễn đàn/nội bộ đội ngũ. Triết lý: chất lượng hơn số lượng; mỗi lần chạy ra 01 bài; nghiên cứu có nguồn thật trước khi viết; luôn có người duyệt trước khi đăng. **Kim chỉ nam chất lượng: insight sâu, độc đáo.**

## 2. Trạng thái hiện tại — RELEASE 1.0 (đã hoàn chỉnh)
Bộ đã tích hợp trọn vòng chất lượng. Ba tầng tài liệu:
- **Đặc tả (Spec) v2.2** — 25 Module + 3 Phụ lục (cái gì / vì sao). Gồm M1 triết lý; M2–M16 quy trình & vận hành; M17–M22 lớp kỹ thuật (bộ nhớ, fact verification, giám sát/đính chính, rubric có ví dụ neo, bảo mật, vận hành); M23 Domain Profile; M24 Learning Path; M25 Visual & Media (ảnh chính + sơ đồ). Phụ lục A checklist · B rubric · C hồ sơ miền kỹ năng mềm.
- **Quality Standard v1.0** — định nghĩa "bài hay" vs "bài đạt". Thang insight L0–L3 (bài hay cần ≥ L2), 3 test insight (So what / Không hiển nhiên / Chịu được phản biện), các bar viết, bài mẫu vàng có chú thích, rubric mới (Insight Depth nặng nhất 30đ).
- **Operating Prompt v1.0** — runtime (bản SHORT dán vào Instructions + bản full trong Knowledge). ĐÃ tích hợp: Insight Gate (chỉ viết nếu insight ≥ L2) + Bar Viết (hook, nhịp câu, chống văn mẫu, trung thực, kết mở) + khối "Bản sạch để đăng" + Hero Image Brief.
- **Usage Guide** và **Integration Guide** (tích hợp vào Claude/ChatGPT/Gemini/API).

Đã chạy thử 1 bài: "Context Engineering cho AI Coding Agent" — đã duyệt, làm sạch, thêm hero brief + sơ đồ Mermaid (file `context-engineering-BAN-SACH.md`).

## 3. Tài sản hiện có (NHỚ TẢI LÊN LẠI)
Cấu trúc gói `AI-TFES.zip`:
```
AI-TFES/
├── 00-README.md                  ← đọc đầu tiên (có banner Release 1.0)
├── 01-Standard/
│   ├── AI-TFES-v2.2.pdf           ← đặc tả 25 module
│   ├── Quality-Standard.pdf       ← chuẩn chất lượng + bài mẫu vàng
│   ├── Integration-Guide.pdf      ← tích hợp vào công cụ AI
│   ├── Usage-Guide.pdf            ← hướng dẫn sử dụng
│   └── CHANGELOG.md
├── 02-Prompts/
│   ├── Operating-Prompt-SHORT.md  ← dán vào ô Instructions
│   ├── Operating-Prompt.md        ← bản full (để trong Knowledge)
│   ├── Daily-Task.md · Weekly-Review.md · Monthly-Audit.md
├── 03-State/                      ← bộ nhớ ngoài (Excel)
│   ├── Editorial-Calendar.xlsx · Knowledge-Base.xlsx
│   ├── Source-Catalog.xlsx · Topic-Backlog.xlsx
├── 04-Domain-Profiles/  engineering.md · soft-skills.md
└── 05-Templates/  Research-Brief · Article · Review · FactCheck · Publish · Correction (.md)
```
File lẻ nên tải lên để làm việc ngay: `AI-TFES-v2.2.pdf`, `Quality-Standard.pdf`, `Operating-Prompt-SHORT.md`, và `context-engineering-BAN-SACH.md` nếu bàn tiếp về bài mẫu.

## 4. Các quyết định & quy ước ĐÃ CHỐT (đừng đi ngược)
1. **Mô hình 3 lớp:** Spec = tra cứu (KHÔNG dán cả vào làm prompt); Operating Prompt = runtime; Tools + State = hạ tầng (web search + bộ nhớ ngoài).
2. **Kim chỉ nam = insight sâu (≥ L2).** Insight Gate: chỉ viết chủ đề hứa hẹn được insight L2+; nếu chỉ L0–L1 → đổi góc/đổi chủ đề, KHÔNG viết vì "đang hot".
3. **Định nghĩa Xong:** AI giao bản nháp mạnh đã đạt chuẩn insight + đã kiểm chứng; người lướt cuối chỉnh giọng (5–10 phút). Bản nháp cần sửa nội dung = chưa xong.
4. **Bộ nhớ ngoài bắt buộc:** Excel/Google Sheet. AI KHÔNG tự ghi — người dán Knowledge Record vào sheet sau mỗi bài để chống trùng.
5. **Web search bắt buộc bật** khi chạy (thiếu → AI bịa nguồn).
6. **Cổng duyệt của người** trước khi đăng. AI dừng ở "Publish Ready".
7. **12 nhãn Section là dàn giáo tự kiểm tra, KHÔNG để đăng.** Bản đăng nằm ở khối "=== BẢN SẠCH ĐỂ ĐĂNG ===": đổi nhãn thành tiêu đề tự nhiên, gỡ thẻ trích dẫn, bỏ log/metadata.
8. **Ảnh:** AI không tự tạo ảnh; chỉ xuất Hero Image Brief (concept + prompt EN + caption + alt) để người tạo/chọn. Ảnh chính minh họa, KHÔNG số liệu/sơ đồ giả, không người thật/logo. Visual thông tin dùng Mermaid/bảng, số liệu khớp nguồn.
9. **Fact verification:** không tin AI tự chấm "Passed" — người kiểm chứng số liệu quan trọng bằng nguồn thật.
10. **Hồ sơ miền:** engineering (mặc định) + soft-skills; mỗi miền tách namespace bộ nhớ. **Seeding Mode** khi kho < ~10 bài (bỏ luật cân bằng, phủ chủ đề nền tảng từ seed_topics).

## 5. Việc còn dang dở / có thể làm tiếp
- Chạy các bài tiếp theo với Operating Prompt v1.0; theo dõi Insight Gate có chặn đúng bài nhạt không.
- Chủ đề trong Topic-Backlog: "MCP là gì và vì sao thành chuẩn kết nối agent", "Multi-agent: khi nào nên/không nên".
- Cập nhật Knowledge-Base cho bài đầu (AITFES-ENG-0001, engineering, AI Engineering, Editorial Score ~90, Evergreen 78) nếu chưa.
- Nếu muốn chạy động hằng ngày: dựng luồng n8n/API + Google Sheet đọc-ghi, giữ cổng duyệt ("tự động soạn — người duyệt").
- Tinh chỉnh Operating Prompt sau vài bài thực tế (nếu AI hay bỏ bước / chọn nguồn sai tier / bài còn "đạt" chưa "hay").

## 6. Cần hỗ trợ ngay điều gì
(Điền khi dán sang session mới — ví dụ: "Chạy bài mới về MCP theo hồ sơ engineering", "Rà lại Operating Prompt", hoặc "Dựng luồng n8n tự động".)
