# Domain Profile: Security (AppSec & secure engineering)

## profile_version
1.6

Chỉ khai báo phần khác biệt so với `engineering.md`.

## identity
Nội dung **bảo mật ứng dụng / secure SDLC** cho đội engineering: threat model, control, trade-off DX vs risk — không fear-mongering, không checklist audit rỗng.

## audience
AppSec, Backend, Platform, DevOps/SRE gần security, Tech Lead. Giả định ship web/API; không cần CISSP.

## tone
Calm · cụ thể · điều kiện rõ (“khi nào control X”). Tránh clickbait breach, tuyệt đối hóa “zero trust giải quyết hết”.

## source_tiers
- **Tier 1:** OWASP, NIST (lọc), Cloud provider security docs (AWS/GCP/Azure), RFC security, vendor-neutral handbooks.
- **Tier 2:** Google/Microsoft/Cloudflare security blogs; PortSwigger; Trail of Bits; NCC Group (kỹ thuật).
- **Tier 3:** Practitioner AppSec blog có PoC/repro có trách nhiệm; post-mortem breach phân tích kỹ thuật.
- **Tier 4:** Twitter infosec — minh họa, không kết luận.
- **Tier 5:** Fearware / “hackers will…” không evidence — không dùng.

## example_strategy
Threat model ngắn, control + residual risk, tình huống misconfig/secrets/supply chain. Không đăng PoC gây hại; nói lớp phòng thủ và điều kiện.

## categories
AppSec · Secure SDLC · Identity & Access · Secrets & Supply Chain · Cloud Security Basics · Detection & Response (eng view) · Privacy Engineering.

## scoring_weights
Practical Value 25 · Risk Clarity 20 · Engineering Impact 15 · Evergreen 15 · Learning 10 · Discussion 10 · Novelty 5.

> **Dùng ở Bước 5 (Editorial Decision)** để ưu tiên góc/chủ đề khi có nhiều lựa chọn — KHÔNG dùng thay cho rubric chấm bài ở `Review.md` (Operating Prompt mục 9).

## sensitivity
Không hướng dẫn tấn công thực chiến gây hại. Không doxx. Phân biệt “mô tả rủi ro” vs “cách khai thác”. Tôn trọng pháp lý.

## freshness
CVE/campaign cụ thể: 14–60 ngày + nêu thời điểm. Control pattern (secrets, IAM): evergreen. Framework compliance: tránh biến thành checklist pháp lý.

## seed_topics
Threat model cho dịch vụ nội bộ nhỏ · Secrets trong CI khi nào đủ · Dependency confusion thực tế · OAuth misconfig thường gặp · Security review trong PR không thành bottleneck · WAF không thay secure code · SBOM khi nào đáng · Break-glass access · Logging PII vô tình · Secure defaults vs self-service platform.

## gold_samples
Chuẩn “hay” — bắt chước **nhịp / độ cụ thể / mở bài**, không copy nguyên văn.

### Sample A — WAF không thay secure code
Mở: “Alert WAF chặn được cuộc tấn công — nhưng lỗ hổng SQL injection gốc vẫn còn nguyên trong code, chờ lần bypass tiếp theo.”
Nhịp: cảm giác an toàn giả từ control lớp ngoài → cơ chế (control biên không sửa lỗi ở lớp trong) → mini-case incident bypass WAF qua header khác → khi nào WAF vẫn đáng (giảm rủi ro tức thời trong lúc chờ patch) → guardrail: control là tạm, fix root cause mới là chính → câu hỏi cho AppSec.
Tránh: liệt kê “5 lớp phòng thủ” như slide compliance.

### Sample B — Secrets trong CI
Mở: “Secret được rotate đúng lịch — nhưng log CI vẫn in ra giá trị cũ mỗi lần build, vì không ai kiểm tra lại sau khi thêm bước debug.”
Nhịp: tưởng rotation đã xong → cơ chế (leak qua kênh phụ: log, cache, artifact) → mini-case phát hiện qua audit ngẫu nhiên → khi nào chấp nhận rủi ro thấp hơn (môi trường nội bộ, không internet-facing) → hệ quả: rotation không đủ, phải audit cả đường đi của secret.
Tránh: liệt kê “best practice quản lý secrets” chung chung.


## gold_sample_guardrail
Gold samples chỉ minh họa nhịp và độ cụ thể. Cấm sao chép số liệu, tên, incident, cấu trúc câu hoặc toàn bộ story arc. Mọi con số/case trong bài thật phải đến từ research hoặc dữ liệu người dùng và được fact-check.
