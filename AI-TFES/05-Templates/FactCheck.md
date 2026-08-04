# Fact-Check Ledger — <Title>

```yaml
artifact_type: fact_check
artifact_schema_version: "1.0"
article_id: SYSTEM_REQUIRED
workflow_run_id: SYSTEM_REQUIRED
artifact_revision: 1
source_revision: <article_draft_revision>
operating_prompt_version: "1.6"
domain_profile_version: <domain@version>
status: <FACT_CHECKED|FACT_CHECK_FAILED>
generated_at: <ISO-8601>
```

| Claim ID | Vị trí | Claim | Loại | Mức quan trọng | Nguồn đã đọc | Evidence excerpt | Ngày nguồn / truy cập | Verdict | Confidence | Xử lý |
|---|---|---|---|---|---|---|---|---|---|---|
| C-001 | <section/paragraph> |  | Fact / Practice / Opinion / Prediction | Central / Supporting / Illustrative | <URL> | <đoạn ngắn hỗ trợ> | <date / date> | Supported / Partially Supported / Unsupported / Contradicted / Unverifiable | High / Medium / Low |  |

**Evidence lineage:** các trang cùng dẫn một nghiên cứu gốc được tính là một lineage, không phải nhiều nguồn độc lập. Với claim trung tâm hoặc rủi ro cao, ưu tiên ≥2 lineage độc lập; ít nhất một nguồn độc lập với vendor/chủ thể được nhắc đến.

## Verdict → hành động
- Supported: giữ nguyên.
- Partially Supported: bổ sung điều kiện/ngữ cảnh rồi kiểm tra lại.
- Unsupported: hạ mức khẳng định hoặc bỏ.
- Contradicted: sửa/bỏ; không được Publish khi còn tồn tại.
- Unverifiable: gắn nhãn Opinion/Prediction hoặc bỏ.

## Kiểm tra bắt buộc
- [ ] Mọi số liệu/trích dẫn khớp nguồn và có ngày truy cập
- [ ] Không có công nghệ/chức năng/số liệu không tồn tại
- [ ] Opinion/Prediction gắn nhãn rõ
- [ ] Claim quan trọng có nguồn đủ thẩm quyền theo `source_tiers` của domain
- [ ] Freshness phù hợp Domain Profile
- [ ] Không còn action bắt buộc chưa xử lý

**Verification Status:** `PASSED | MINOR_ISSUE | MAJOR_ISSUE | FAILED`
