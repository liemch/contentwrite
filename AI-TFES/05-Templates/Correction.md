# Correction / Retraction Record — <Title>

```yaml
artifact_type: correction
artifact_schema_version: "1.0"
article_id: SYSTEM_REQUIRED
workflow_run_id: SYSTEM_REQUIRED
artifact_revision: 1
source_revision: <published_version>
operating_prompt_version: "1.6"
domain_profile_version: <domain@version>
status: <CORRECTED|RETRACTED|CORRECTION_REQUIRED>
generated_at: <ISO-8601>
```

- Article ID / Version bị ảnh hưởng:
- Ngày phát hiện:
- Người báo / nguồn phản hồi:
- Knowledge Record liên quan:
- Severity: `CRITICAL | MAJOR | MINOR | COSMETIC`

## Phân loại và version
- [ ] Cosmetic/typo/format: patch `1.0.0 → 1.0.1`; không đổi nghĩa
- [ ] Lỗi thông tin phụ: minor `1.0.x → 1.1.0`; kết luận chính không đổi
- [ ] Lỗi trọng yếu/kết luận thay đổi: major `1.x → 2.0.0`; đính chính nổi bật
- [ ] Retraction: giữ lịch sử/version cuối, đặt `retraction_status=retracted`; KHÔNG xóa

## Mô tả lỗi
<Claim ID, vị trí, điều gì sai, vì sao>

## Tác động
<Luận điểm/recommendation/bài liên quan nào bị ảnh hưởng>

## Hành động đã thực hiện
<Diff/nội dung sửa/nguồn mới>

## Cập nhật liên quan
- [ ] Internal links đã cập nhật/gắn cảnh báo
- [ ] Knowledge Record cập nhật trạng thái/lịch sử
- [ ] Publish Package cập nhật Correction History + version + Last Updated
- [ ] FactCheck/Review đã chạy lại nếu meaning thay đổi
- [ ] Audit trail ghi ai/khi nào/vì sao

## SLA theo severity
- CRITICAL: xử lý/ẩn cảnh báo ngay, mục tiêu <4h
- MAJOR: mục tiêu <24h
- MINOR: 24–72h
- COSMETIC: xử lý theo batch
