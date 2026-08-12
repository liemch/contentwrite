# Domain Profile: Product (discovery & product engineering)

## profile_version
1.6

Chỉ khai báo phần khác biệt so với `engineering.md`.

## identity
Diễn đàn nội bộ về **làm sản phẩm kỹ thuật**: discovery, ưu tiên, đo lường, trade-off phạm vi — dành cho Product Engineer / PM / Tech Lead làm việc sát engineering.

## audience
Product Engineer, Product Manager, Tech Lead, Engineering Manager gần product, designer kỹ thuật. Giả định biết ship phần mềm; không cần MBA.

## tone
Thực tiễn · trade-off rõ · đo được · không strategy deck / buzzword. Giọng “đã thử trên sản phẩm”, không “best practice tuyệt đối”.

## source_tiers
- **Tier 1:** Reforge/SVPG (Marty Cagan) có kiểm chứng; case study công ty tech có số liệu; nghiên cứu sản phẩm có phương pháp.
- **Tier 2:** Lenny’s Newsletter (lọc kỹ), Mind the Product, Intercom/Stripe/Notion engineering+product blogs.
- **Tier 3:** PM/Founder blog có track record; post-mortem sản phẩm công khai.
- **Tier 4:** Twitter/LinkedIn anecdote — minh họa, không kết luận.
- **Tier 5:** Growth-hack / “10x product tips” vô căn cứ — không dùng.

## example_strategy
Tình huống backlog / discovery interview / experiment / rollback phạm vi. Số liệu chỉ khi có nguồn; nếu không → định tính có điều kiện.

## categories
Discovery · Prioritization · Product Metrics · Experimentation · Roadmapping · Product-Engineering Collaboration · Platform Product · B2B SaaS Scope.

## scoring_weights
Practical Value 25 · Decision Quality 20 · Learning Value 15 · Evergreen 15 · Discussion 10 · Business Impact 10 · Novelty 5.

> **Dùng ở Bước 5 (Editorial Decision)** để ưu tiên góc/chủ đề khi có nhiều lựa chọn — KHÔNG dùng thay cho rubric chấm bài ở `Review.md` (Operating Prompt mục 9).

## sensitivity
Không lộ roadmap nội bộ nhạy cảm; không gắn tên khách hàng thật nếu chưa public. Không “blame” đội ngũ.

## freshness
Framework/ưu tiên: evergreen. Tool/process mới: 30–90 ngày. Case study: nêu thời điểm.

## seed_topics
Khi nào không nên chạy A/B test · Opportunity solution tree trong team nhỏ · RACI giữa PM và Tech Lead khi scope phình · North Star metric giả tạo · Discovery cho platform nội bộ · Kill criteria trước khi build · Spec quá sớm vs code quá sớm · Đo outcomes thay output sprint · Hand-off PM→Eng làm mất context · Scope cut không làm mất lòng stakeholder.

## gold_samples
Chuẩn “hay” — bắt chước **nhịp / độ cụ thể / mở bài**, không copy nguyên văn.

### Sample A — North Star metric giả tạo
Mở: “Cả team tự hào metric Bắc Đẩu tăng 15% quý này — nhưng doanh thu đứng yên, vì metric đo engagement chứ không đo giá trị khách chịu trả tiền.”
Nhịp: metric tăng nhưng business không đổi → cơ chế (proxy metric tách khỏi outcome thật) → mini-case discovery lộ ra gap → khi nào metric proxy vẫn ổn (giai đoạn sớm, chưa đủ data outcome) → câu hỏi cho PM.
Tránh: liệt kê “cách chọn North Star đúng” dạng framework slide.

### Sample B — Kill criteria trước khi build
Mở: “Feature đã ship 2 sprint trước khi ai đó hỏi: ‘Nếu số liệu này không đạt, mình có dừng không?’ — không ai trả lời được, vì chưa từng định nghĩa.”
Nhịp: build trước, hỏi sau → cơ chế (thiếu kill criteria = sunk cost tự động) → mini-case rollback đau vì đã cam kết public → khi nào không cần kill criteria (thử nghiệm rẻ, dễ đảo ngược) → hệ quả cho roadmap.
Tránh: liệt kê “checklist trước khi build” kiểu template.

### Sample C — Scope cut không làm mất stakeholder
Mở: “Cắt phạm vi đúng kỹ thuật — nhưng stakeholder vẫn ký off vì slide roadmap vẫn hiển thị feature đã bỏ.”
Nhịp: quyết định kỹ thuật vs cam kết ngoài → cơ chế (artifact roadmap lệch thực tế) → mini-case sync sau scope cut → khi nào cut im lặng vẫn ổn (internal tool) → hệ quả cho PM/Tech Lead.
Tránh: framework RACI slide không có tình huống.


## anti_generic_and_realism
Phase 1 — giảm bài generic, siết tính thực tế (Product):

**CẤM**
- Mở strategy deck: “Trong bối cảnh cạnh tranh…”, “Product-market fit là chìa khóa”
- Buzzword không trade-off: “10x growth”, “customer-centric” rỗng
- Success story cá nhân không kiểm chứng; số liệu không nguồn
- Mini-case bịa “startup ABC” không có chi tiết quyết định

**BẤT BUỘC**
- Hook theo nhịp gold_samples (metric giả / thiếu kill criteria / cam kết lệch scope)
- ≥1 mini-case discovery/backlog/experiment có chủ ngữ PM/Tech Lead/team
- Đúng **một** chỗ “khi nào KHÔNG nên” (A/B, roadmap tool, metric mới)
- Khuyến nghị luôn kèm điều kiện và trade-off rõ
- Số liệu chỉ khi Research có nguồn; không thì định tính có điều kiện


## gold_sample_guardrail
Gold samples chỉ minh họa nhịp và độ cụ thể. Cấm sao chép số liệu, tên, incident, cấu trúc câu hoặc toàn bộ story arc. Mọi con số/case trong bài thật phải đến từ research hoặc dữ liệu người dùng và được fact-check.
