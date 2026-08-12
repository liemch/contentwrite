# Domain Profile: Công nghệ mới (emerging / new tech)

## profile_version
1.6

Chỉ khai báo phần khác biệt so với `engineering.md`.

## identity
Nội dung **công nghệ mới thật sự đổi gì**: launch, early adoption, trade-off, khi nào *chưa* đáng — cho người tò mò kỹ thuật và early adopter. Không press-release hype.

## audience
Early adopter, Product/Engineer tò mò, tech curious. Biết khái niệm cơ bản (app, cloud, AI); không cần chuyên sâu research.

## tone
Tò mò có kỷ luật · so sánh rõ · “chưa chứng minh” phải nói thẳng. Tránh tuyệt đối hóa, roadmap vendor, “sẽ thay đổi mọi thứ”.

## source_tiers
- **Tier 1:** Docs/release notes chính thức; paper/benchmark có phương pháp; engineering blog có số liệu/repro.
- **Tier 2:** Phóng viên công nghệ uy tín; phân tích độc lập có nguồn; post-mortem early adopters.
- **Tier 3:** Demo/hands-on có giới hạn nêu rõ; podcast chuyên môn có kiểm chứng chéo.
- **Tier 4:** Twitter/HN hype — chỉ minh họa nhiệt độ cộng đồng.
- **Tier 5:** Affiliate “best new gadget” / launch spam — không dùng làm nguồn kết luận.

## example_strategy
So sánh trước/sau khi thử · chi phí ẩn (học, tích hợp, lock-in) · failure mode early adopter. Số % chỉ khi có trong nguồn + thời điểm.

## categories
Emerging Platforms · New Developer Tools · Hardware & Gadgets · AI Product Launches · Infra & Cloud New · Adoption Trade-offs.

## scoring_weights
Practical Signal 25 · Hype Filter 20 · Learning Value 15 · Freshness 15 · Discussion 10 · Evergreen Pattern 10 · Novelty 5.

> **Dùng ở Bước 5 (Editorial Decision)** để ưu tiên góc/chủ đề — KHÔNG thay rubric chấm bài ở Review.

## sensitivity
Không claim khả năng vượt evidence; phân biệt beta vs GA; nêu xung đột lợi ích nếu nguồn gần vendor. Không hướng dẫn bypass an toàn/pháp lý.

## freshness
Launch/API/model cụ thể: 14–45 ngày (ghi rõ thời điểm). Pattern adoption: evergreen hơn nhưng vẫn gắn ví dụ mới.

## seed_topics
Khi nào không nên early-adopt tool mới · Lock-in sau 90 ngày dùng free tier · Benchmark marketing vs workload thật · “Open” nhưng ecosystem đóng · Migration cost bị giấu trong demo · Agent/tool mới thay workflow cũ khi nào đáng · Hardware AI gadget vs cloud API · Privacy trade-off sản phẩm mới · Compatibility debt sau upgrade · Tín hiệu chết sớm của platform mới.

## gold_samples
Chuẩn “hay” — bắt chước **nhịp / độ cụ thể / mở bài**, không copy nguyên văn.

### Sample A — Early adopt quá sớm
Mở: “Team chuyển sang platform mới vì demo 8 phút quá mượt — tháng sau, half thời gian dành để chờ feature ‘sắp có’ trên roadmap công khai.”
Nhịp: cám dỗ demo → cơ chế (gap giữa happy path và production) → mini-case rollback → khi nào early adopt đáng (đau điểm cụ thể, exit plan) → câu hỏi cho lead.
Tránh: liệt kê “5 công nghệ phải học 2026”.

### Sample B — Benchmark marketing
Mở: “Slide nói nhanh hơn 40% — trên dataset của họ, với hardware họ chọn, và chưa kể bước preprocess chiếm nửa pipeline của bạn.”
Nhịp: số đẹp → điều kiện bị giấu → case reproduce lệch → khi nào tin benchmark (cùng workload) → hệ quả quyết định mua.
Tránh: copy bảng so sánh vendor không ngữ cảnh.

### Sample C — Lock-in sau free tier
Mở: “Migration sang platform mới trông chỉ vài ngày — cho đến khi phát hiện 200 webhook và schema event không tương thích ngược.”
Nhịp: free tier dễ vào → cơ chế (integration debt) → mini-case estimate migration thật → khi nào lock-in chấp nhận được → exit plan.
Tránh: “5 công nghệ hot 2026”.


## anti_generic_and_realism
Phase 1 — giảm bài generic, siết tính thực tế (New Tech):

**CẤM**
- Press-release hype: “Sẽ thay đổi mọi thứ”, roadmap vendor làm sự thật
- Benchmark marketing copy không workload
- Affiliate “best new gadget”; launch spam
- Claim beta = GA; không nêu xung đột lợi ích vendor

**BẤT BUỘC**
- Hook theo nhịp gold_samples (early adopt sớm / benchmark điều kiện / lock-in ẩn)
- ≥1 hands-on trade-off (học, tích hợp, migration, cost ẩn)
- Đúng **một** chỗ “khi nào KHÔNG nên” early-adopt
- Số % chỉ khi Research có nguồn + thời điểm; nêu beta vs GA
- Failure mode early adopter — không chỉ lợi ích


## gold_sample_guardrail
Gold samples chỉ minh họa nhịp và độ cụ thể. Cấm sao chép số liệu, tên, incident, cấu trúc câu hoặc toàn bộ story arc. Mọi con số/case trong bài thật phải đến từ research hoặc dữ liệu người dùng và được fact-check.
