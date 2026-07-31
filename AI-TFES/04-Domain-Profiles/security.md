# Domain Profile: Security (AppSec & secure engineering)

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

## sensitivity
Không hướng dẫn tấn công thực chiến gây hại. Không doxx. Phân biệt “mô tả rủi ro” vs “cách khai thác”. Tôn trọng pháp lý.

## freshness
CVE/campaign cụ thể: 14–60 ngày + nêu thời điểm. Control pattern (secrets, IAM): evergreen. Framework compliance: tránh biến thành checklist pháp lý.

## seed_topics
Threat model cho dịch vụ nội bộ nhỏ · Secrets trong CI khi nào đủ · Dependency confusion thực tế · OAuth misconfig thường gặp · Security review trong PR không thành bottleneck · WAF không thay secure code · SBOM khi nào đáng · Break-glass access · Logging PII vô tình · Secure defaults vs self-service platform.
