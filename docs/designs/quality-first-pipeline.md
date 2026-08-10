# Quality-first Pipeline — Design

**Branch:** `optimize/process`  
**Date:** 2026-08-10  
**Goal:** Hệ thống tối ưu **bài đáng đọc**, không tối ưu “qua cổng máy”.

Related: [WP-PV2-02](../work-packages/WP-PV2-02-editorial-format-reliability.md),
[AI-TFES-v2-RC2-validation](../releases/AI-TFES-v2-RC2-validation.md),
[editorial-v2-parser-production-failure](../debug/editorial-v2-parser-production-failure.md)

---

## 1. Principles

1. **Craft trước, contract sau** — machine JSON/score là phương tiện; người đọc là tiêu chí.
2. **Gate đo chất lượng đọc** — form (word floor, GOLD_BAR surface, L2 jargon) không được thay thế insight/structure/voice.
3. **Hội tụ** — giữ best candidate; không đốt revision budget vì format; không auto-ack khi regression.
4. **Publish bám draft tốt nhất** — không regenerate sạch rồi “polish cứu luận điểm”.
5. **Ngôn ngữ tách tầng** — prompt máy được dùng tier nội bộ; **bản đăng cấm** Insight L2 / Gate / GOLD_BAR / machine lines.

---

## 2. Current → target role map

| Step | Vai trò hiện tại (vấn đề) | Vai trò mục tiêu |
|------|---------------------------|------------------|
| Research | Audit format nguồn | Giữ; ưu tiên chất lượng lineage hơn label regex |
| Insight Gate | L2 jargon gate | Giữ filter sớm; jargon chỉ ở tab Insight |
| Write | Full Article.md + clip context | Viết sâu hơn; context đủ; không nhét meta L2 vào body |
| Editorial Review | Chấm + mở remediation | Chẩn đoán defects; format fail ≠ content fail |
| Human Review | Dễ bị auto-ack sau revision | Pause khi regression; ghi chú thật khi accept |
| Remediation | Full-draft + preserve mù | MINOR preserve; MAJOR/REWRITE được sửa cấu trúc |
| Fact | Ledger đúng | Giữ blocking semantics |
| Final Verify | Chấm craft lần 2 → false MINOR | Lock evidence/actions; không mở vòng craft giả |
| Publish | Regenerates clean | Derive từ best locked draft + scrub meta |
| Polish | Surface only, “không rewrite thesis” | Chỉnh mạch/đọc; không phải chỗ cứu insight yếu |
| Reader Sim | Clip ngắn | Đọc đủ thân bài; feedback actionable |

---

## 3. Phase delivery (1 → 2 → 3)

### Phase A (ship trên branch này)

- Reader scrubber: không còn Insight L2 / Gate / machine lines trên bản đăng.
- Soften write/publish prompts: cấm jargon pipeline trong body.
- Design doc này.

### Phase B (ship trên branch này)

Bật canary hội tụ (rollback từng flag):

| Flag | ON |
|------|----|
| `bestCandidateLock` | yes |
| `falseFinalMinorGuard` | yes |
| `minorPreservePrompt` | yes (MINOR only) |
| `regressionAutoAckBrake` | yes |
| `promptArchitecture` | yes (RC2 Preview) |

Không hạ score floor trong Phase B.

### Phase C — WP-QF-01..06 (Done on `optimize/process`)

Thứ tự đã ship: QF-01 → QF-02 → QF-03 → QF-05 → QF-04 → QF-06 (memo only).

| WP | Tên | Mục tiêu | Status |
|----|-----|----------|--------|
| **WP-QF-01** | Publish bám best draft | Clean publish derive từ best locked draft | Done |
| **WP-QF-02** | Context budget reader/fact | Nâng clip review/fact/reader sim | Done |
| **WP-QF-03** | Severity-aware remediation | MINOR preserve; MAJOR/REWRITE rewrite có kiểm soát | Done |
| **WP-QF-04** | Dual-score craft collapse | lock-v2 empty residuals = craft-only suppress | Done |
| **WP-QF-05** | Prompt language split | Machine L0–L3; reader prompts cấm jargon | Done |
| **WP-QF-06** | Threshold revisit | Floors 85/90 **unchanged** pending cohort | Decision memo |

---

## 4. KPIs

| KPI | Định nghĩa | Mục tiêu hướng |
|-----|------------|----------------|
| Meta-leak rate | Bản đăng chứa Insight L2 / Gate / GOLD_BAR / machine lines | **0** |
| Human “đáng đọc” | Feedback finalUsability / reuseIntent | Tăng vs baseline v1.6 |
| Candidate retention | Best score retained on remediation/exhaustion | Cao khi lock ON |
| False Final MINOR | Craft-only MINOR suppressed | Tăng suppression đúng |
| Exhaustion / format | Content exhaustion vs parser pause | Parser không đếm exhaustion |
| First-pass craft | Completed với 0 revision sau Editorial đạt | Theo dõi, không tối ưu mù |

---

## 5. Non-goals (đợt này)

- Tăng revision retry 3→5
- Patch Editing / multi-agent / schema
- Nới Fact ledger blocking
- Rewrite toàn bộ `workflow.ts` một PR
- Force-enable lên `main` trước Preview xanh

---

## 6. Rollback

- Scrubber: revert `publish-content.ts` (additive, an toàn).
- Flags: từng `enabled: false` trong `pipeline-config.ts` → về v1.6 / RC1 subset.
- Không migration / env bắt buộc.
