# Publish Package — <Title>

```yaml
artifact_type: publish_package
artifact_schema_version: "1.0"
article_id: SYSTEM_REQUIRED
workflow_run_id: SYSTEM_REQUIRED
artifact_revision: 1
source_revision: <final_review_revision>
operating_prompt_version: "1.6"
domain_profile_version: <domain@version>
status: PUBLISH_READY
generated_at: <ISO-8601>
```

## Metadata bắt buộc
- Article ID:
- Version: 1.0.0
- Original Publish Date:
- Last Updated:
- Domain / Category:
- Tags / Keywords:
- Author (Human Owner):
- Reviewer / Approver:
- Review Status: `AWAITING_APPROVAL | APPROVED | REJECTED`
- Reading Time / Difficulty:
- Knowledge Record:
- Correction History:

> Giá trị mặc định của Review Status là `AWAITING_APPROVAL`. LLM không tự chuyển sang `APPROVED` hoặc tuyên bố đã publish.

## Nội dung
- [ ] Bản sạch đã được **viết lại** từ nháp 12 phần
- [ ] Không còn heading biên tập nội bộ (`Executive Summary`, `Deep Analysis`...)
- [ ] Insight trung tâm xuất hiện sớm
- [ ] References đầy đủ và chỉ gồm nguồn có thật
- [ ] Discussion Questions chỉ giữ khi tự nhiên
- [ ] Related Articles: 0–5 bài có thật; không đủ thì để trống

## Bản sạch để đăng

=== BẢN SẠCH ĐỂ ĐĂNG ===

# <Title>

<Subtitle>

![<alt text>](HERO_IMAGE)

<Hook + insight sớm; thân bài dùng heading tự nhiên; kết mở.>

## References
1.

## Hình ảnh
- Hero path:
- Alt text:
- Caption:
- Credit: `Ảnh minh họa (AI)` hoặc nguồn hợp lệ
- [ ] Không nhúng số liệu/sơ đồ giả
- [ ] Không dùng ảnh có bản quyền trái phép

## SEO & Knowledge
- SEO Title:
- Meta Description:
- Search Summary:

## Publishing Checklist
- [ ] Final Review đạt điều kiện `PUBLISH_READY`
- [ ] Fact Verification = `PASSED`
- [ ] Không Placeholder / TODO / Draft note trong bản sạch
- [ ] Knowledge Record đã tạo/cập nhật
- [ ] Trạng thái hiện tại là `AWAITING_APPROVAL` hoặc đã có approver thật

> Sau publish phát sinh lỗi: tạo `Correction.md`, cập nhật version/Correction History và `retraction_status`; không xóa lịch sử.
