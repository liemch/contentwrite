# Editorial Review — <Title>

```yaml
artifact_type: review
artifact_schema_version: "1.0"
article_id: SYSTEM_REQUIRED
workflow_run_id: SYSTEM_REQUIRED
artifact_revision: 1
source_revision: <article_draft_revision>
operating_prompt_version: "1.6"
domain_profile_version: <domain@version>
review_phase: <EDITORIAL_REVIEW|FINAL_VERIFICATION>
status: <EDITORIAL_REVIEWED|FINAL_REVIEWED|MAJOR_REVISION_REQUIRED|REWRITE_REQUIRED>
generated_at: <ISO-8601>
```

> Rubric duy nhất. Pha `EDITORIAL_REVIEW`: Evidence là `PROVISIONAL`. Pha `FINAL_VERIFICATION`: bắt buộc đọc `FactCheck.md`, khóa Evidence và quyết định cuối.

| Tiêu chí | Trọng số | Điểm | Trạng thái | Ghi chú |
|---|:---:|:---:|---|---|
| Insight Depth (tối thiểu 22/30) | 30 |  | LOCKED | Insight Gate ≥ L2? |
| Evidence | 20 |  | PROVISIONAL / LOCKED | Khóa sau Fact Check |
| Writing Craft | 20 |  | LOCKED | Rõ ràng · mạch lạc · nhịp đọc |
| Practical Value | 15 |  | LOCKED | Áp dụng được, có điều kiện |
| Intellectual Honesty | 10 |  | LOCKED | Giới hạn, phản biện thật |
| Structure & Flow | 5 |  | LOCKED | Không nhảy cóc, không listicle giả |
| **Tổng** | **100** |  |  | |

## Quality Gates — phải đạt hết
- [ ] G1 Cấu trúc phù hợp; không tạo mục rỗng để đủ form
- [ ] G2 Không lỗi logic
- [ ] G3 Đủ bằng chứng theo tier của domain
- [ ] G4 Insight trung tâm ≥L2
- [ ] G5 Có giá trị thực tiễn và điều kiện áp dụng
- [ ] G6 Có kết mở/câu hỏi thảo luận phù hợp
- [ ] G7 Không quảng bá/clickbait
- [ ] G8 Không sao chép

## Insight check
- **Insight trung tâm:** <một câu + L2/L3>
- **Trade-off:**
- **Góc phản biện:**
- **Bài học thực tiễn:**

## Fact-check linkage — bắt buộc ở FINAL_VERIFICATION
- FactCheck revision: <>
- Verification Status: <PASSED|MINOR_ISSUE|MAJOR_ISSUE|FAILED>
- Unsupported/Contradicted claims còn lại: <0 bắt buộc để Publish Ready>
- Required actions còn mở: <0 bắt buộc để Publish Ready>

## Decision
> Runtime đọc machine block theo đúng `review_phase`. Tên field và số dòng do prompt của phase cung cấp; không dùng field của phase khác. **Không** ghi `PUBLISH_READY` ở bước 9b (`PUBLISH_READY` là state sau Polish + Reader Sim).

- `FINAL_REVIEWED`: tổng ≥90, Insight Depth ≥22, G1–G8 đạt, Fact Check `PASSED`, không còn action mở.
- `MINOR_REVISION_REQUIRED`: 85–89 hoặc chỉ còn lỗi không đổi luận điểm.
- `MAJOR_REVISION_REQUIRED`: 75–84 hoặc Fact Check `MINOR_ISSUE/MAJOR_ISSUE`.
- `REWRITE_REQUIRED`: <75, Insight <22, hoặc Fact Check `FAILED`.

Machine lines: đặt ở cuối file, plain text, mỗi trường một dòng, dùng **đúng block được prompt của phase yêu cầu**. Template này không khai báo lại key để tránh trộn contract `EDITORIAL_REVIEW` và `FINAL_VERIFICATION`. CẤM điểm 0/0 khi đã có draft + Fact Check PASSED.

**Kết luận:** <>  
**Strengths:** <>  
**Required Revisions:** <>
