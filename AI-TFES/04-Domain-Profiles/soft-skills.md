# Domain Profile: Soft Skills cho đội ngũ kỹ thuật

## profile_version
1.6

Chỉ khai báo phần khác biệt so với `engineering.md`. Xem Phụ lục C của bộ đặc tả để biết đầy đủ.

## identity
Nội dung kỹ năng mềm **nghiêm túc, dựa trên bằng chứng**, dành cho người làm kỹ thuật vốn hoài nghi self-help. Áp đúng sự chặt chẽ của AI-TFES (bằng chứng, trade-off, "khi nào KHÔNG nên") vào các chủ đề con người.

## audience
Engineer / Tech Lead / Engineering Manager — ở khía cạnh con người: giao tiếp, phản hồi, xung đột, ảnh hưởng, cộng tác, ra quyết định.

## tone
Trung lập · đồng cảm · tự sự vừa phải · khuyến khích trao đổi. Tránh lên lớp, sáo rỗng, hứa hẹn kiểu self-help.

## source_tiers  (KHÁC hẳn engineering)
- **Tier 1:** Nghiên cứu bình duyệt (tâm lý học, khoa học hành vi, quản trị), meta-analysis, sách nền tảng có căn cứ.
- **Tier 2:** Harvard Business Review, MIT Sloan, APA, nghiên cứu tổ chức lớn.
- **Tier 3:** Chuyên gia có nền tảng học thuật, xác minh được.
- **Tier 4:** Kinh nghiệm cộng đồng — chỉ minh họa, không kết luận.
- **Tier 5:** Self-help vô căn cứ / nội dung AI — không dùng.

## pseudoscience_blocklist  (BẮT BUỘC)
Không trình bày như sự thật: MBTI như công cụ đo lường tin cậy, "learning styles", neuromyth (não trái/phải), các mẹo self-help không bằng chứng. Nếu nhắc tới, phải nêu rõ trạng thái bằng chứng.

## example_strategy
Tình huống công sở · hội thoại mẫu · bài tập tự đánh giá · kịch bản role-play. Tránh câu chuyện thành công cá nhân không kiểm chứng.

## categories
Communication · Feedback · Conflict & Difficult Conversations · Influence & Persuasion · Collaboration · Decision-making · Focus & Wellbeing · Career & Growth · Leadership & Mentoring.

## scoring_weights
Practical Value 20 · Evidence Rigor 20 · People/Team Impact 20 · Evergreen 15 · Learning Value 10 · Discussion 10 · Novelty 5.

> Tổng bắt buộc = 100.

> **Dùng ở Bước 5 (Editorial Decision)** để ưu tiên góc/chủ đề khi có nhiều lựa chọn — KHÔNG dùng thay cho rubric chấm bài ở `Review.md` (Operating Prompt mục 9). `Evidence Rigor` ở đây bổ trợ cho `pseudoscience_blocklist`, không thay thế Fact Check ở Bước 9.

## sensitivity  (BẮT BUỘC)
Tôn trọng đa dạng & bối cảnh văn hóa nơi làm việc Việt Nam. Không chẩn đoán tâm lý cá nhân. Không phán xét đạo đức. Trình bày như lựa chọn có điều kiện, không phải chân lý ứng xử.

## seed_topics
Đưa phản hồi kỹ thuật không gây phòng thủ · Nói "không" với scope creep · Bất đồng trong code review không leo thang · Giải thích kỹ thuật cho stakeholder phi kỹ thuật · Ra quyết định khi thiếu thông tin · Xây psychological safety · Chạy 1:1 hiệu quả · Xử lý quá tải công việc · Lắng nghe chủ động trong họp · Chuyển từ engineer sang dẫn dắt con người.

## learning_track_seed
"Giao tiếp kỹ thuật hiệu quả": (1) Lắng nghe chủ động [Beginner] → (2) Giải thích khái niệm rõ ràng [Beginner] → (3) Đưa phản hồi xây dựng [Intermediate] → (4) Điều hướng bất đồng [Intermediate] → (5) Thuyết phục & tạo ảnh hưởng [Advanced].

## gold_samples
Chuẩn “hay” — bắt chước nhịp / độ cụ thể, không copy nguyên văn. Evidence-based, không self-help sáo.

### Sample A — Feedback
Mở: “Bạn nói ‘cần proactive hơn’ — hai tuần sau không gì đổi, vì người nhận vẫn không biết *hành vi nào* cần dừng vào thứ Ba tuần sau.”
Nhịp: feedback mơ → cơ chế hành vi quan sát được → mini-case 1:1 → khi nào không đẩy (thiếu dữ liệu) → câu hỏi cho lead.

### Sample B — Quyết định
Mở: “Team bàn 45 phút rồi chọn phương án ‘an toàn nhất’ — không phải vì đúng, vì không ai muốn sở hữu rủi ro của phương án sắc.”
Nhịp: quyết định ủy thác sợ hãi → khung sở hữu rủi ro → case sprint planning → guardrail → hệ quả.


## gold_sample_guardrail
Gold samples chỉ minh họa nhịp và độ cụ thể. Cấm sao chép số liệu, tên, incident, cấu trúc câu hoặc toàn bộ story arc. Mọi con số/case trong bài thật phải đến từ research hoặc dữ liệu người dùng và được fact-check.
