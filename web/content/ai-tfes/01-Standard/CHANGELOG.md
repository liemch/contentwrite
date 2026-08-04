# CHANGELOG — AI-TFES v1.6

## Compatibility
- Giữ nguyên 14 tên file hiện có.
- Giữ nháp Article 12 phần và các heading chính.
- Metadata mới nằm ở đầu artifact; hệ thống cũ có thể bỏ qua code block này.

## Fixed
- Sửa mâu thuẫn Publish “đủ 12 phần” với yêu cầu bản sạch.
- Tách Review thành Editorial Review và Final Verification Gate để loại dependency ngược FactCheck.
- Chuẩn hóa `soft-skills.scoring_weights` tổng 100.
- Review Status mặc định `AWAITING_APPROVAL`, không hardcode Approved.
- Related Articles cho phép 0–5 bài thật.

## Added
- Workflow state machine và enum chuẩn.
- Artifact metadata/version/revision lineage.
- Evidence lineage, claim ID, source/access date và confidence trong FactCheck.
- Semantic versioning cho correction/retraction.
- Runtime contract cho resolved Domain Profile.
- Guardrail chống sao chép/bịa số từ gold samples.
