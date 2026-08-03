# Domain Profile: Engineering (mặc định)

Hồ sơ miền gốc của AI-TFES. Đây là giá trị mặc định — các hồ sơ khác chỉ cần khai báo phần khác biệt so với hồ sơ này.

## identity
Diễn đàn công nghệ nội bộ; biến tri thức kỹ thuật đáng tin cậy thành tài sản học tập thực tiễn cho đội ngũ engineer.

## audience
Software / Backend / Frontend / QA / DevOps / Platform / AI Engineer, Solution Architect, Tech Lead, Engineering Manager, CTO. Giả định có nền tảng kỹ thuật ≥2 năm.

## tone
Professional · Objective · Educational · Practical · Engineering-oriented. Không giật gân, không cảm tính, không quảng bá.

## source_tiers
- **Tier 1:** Google/Microsoft/Amazon Builders Library, Cloudflare, Stripe, GitHub, Netflix Tech Blog, OpenAI, Anthropic; Official Docs, RFC, Research Paper, Whitepaper, Engineering Handbook.
- **Tier 2:** Martin Fowler, Thoughtworks Radar, O'Reilly, ACM, IEEE, InfoQ.
- **Tier 3:** Staff/Principal/Distinguished Engineer blog (xác minh tác giả).
- **Tier 4:** Reddit, Hacker News, Stack Overflow — chỉ để hiểu trải nghiệm, không kết luận.
- **Tier 5:** AI-generated content — không dùng làm nguồn.

## example_strategy
Case study công ty công nghệ + tình huống dự án thực tế + bài học áp dụng. Ví dụ để minh họa lập luận, không kể thành tích.

## categories
AI Engineering, Software Architecture, System Design, Cloud, DevOps, Platform Engineering, Security, Engineering Leadership, Developer Experience, Product Engineering, Engineering Culture, Career Development.

## scoring_weights
Practical Value 25 · Engineering Impact 20 · Learning Value 15 · Evergreen 15 · Discussion 10 · Business Impact 10 · Novelty 5.

> **Dùng ở Bước 5 (Editorial Decision)** để ưu tiên góc/chủ đề khi có nhiều lựa chọn — KHÔNG dùng thay cho rubric chấm bài ở `Review.md` (Operating Prompt mục 9).

## sensitivity
Không có ràng buộc đặc biệt ngoài quy tắc chung (không quảng bá, không khẳng định tuyệt đối).

## freshness
Tin tức 7 ngày · Công nghệ mới 30 ngày · Best Practice / Architecture / Leadership / System Design: không giới hạn.

## seed_topics
Modular Monolith · Feature Flags · Progressive Delivery · CAP Theorem · Event Sourcing · API Versioning · Internal Developer Platform · Observability cơ bản · AI Coding Agents · ADR (Architecture Decision Record).

## gold_samples
Chuẩn “hay” — bắt chước **nhịp / độ cụ thể / mở bài**, không copy nguyên văn.

### Sample A — Feature flags
Mở: “Ba tuần sau launch, team vẫn chưa dám tắt flag cũ — không vì bug, vì không ai nhớ flag đang che quyết định kiến trúc nào.”
Nhịp: nghịch lý vận hành → cơ chế (flag = nợ quyết định) → mini-case rollback → khi nào KHÔNG nên (prototype ngắn) → hệ quả cho Tech Lead.
Tránh: định nghĩa “feature flag là gì”, checklist 7 lợi ích.

### Sample B — Observability
Mở: “Alert kêu đúng — nhưng on-call mất 40 phút mới biết *node nào* đang chết vì dashboard đo average, không đo tail.”
Nhịp: cảnh incident → metric sai câu hỏi → trade-off cardinality/cost → guardrail → câu hỏi mở cho platform.
Tránh: liệt kê “3 trụ logs/metrics/traces” như giáo trình.

### Sample C — ADR
Mở: “Cuộc họp kiến trúc kết thúc bằng ‘mọi người đồng ý’ — sáu tháng sau không ai nhớ đã từ chối phương án nào.”
Nhịp: quyết định mất dấu → ADR như hợp đồng với tương lai → case team 8 người → khi ADR trở thành nghi lễ → hành động hẹp.
