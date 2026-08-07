# Editor Feedback Protocol — WP2.7

## Trigger

Show the form when an article is:

- `PUBLISH_READY`, `APPROVED`, or `PUBLISHED`; or
- revision/fact remediation exhausted.

Do not interrupt an in-progress workflow.

## Questions

All ratings use 1–5:

1. Bài cuối có dùng được không?
2. Anh/chị đã phải sửa tay nhiều không?
3. Bước nào khó hiểu nhất? (free text)
4. Thông báo lỗi có giúp biết phải làm gì không?
5. Có dùng lại ContentWrite cho bài tiếp theo không?

An optional note captures context not covered above.

## Storage and privacy

- Stored in `Article.deskJson.validationFeedback`.
- Includes article ID, submitting user ID and timestamp.
- One current response per article; submitting again updates it.
- Article API authorization applies: owner/editor of that article or admin.
- Not exposed on public library/series views.
- Notes are bounded; do not enter API keys, source documents, client secrets or personal data.

No separate survey service, public endpoint or analytics tracker is used.

## Interpretation

- Ratings are directional product evidence, not a blinded quality benchmark.
- Low manual-edit score and high usability can coexist; report each field separately.
- Free-text confusion must be coded after collection, not forced into a predefined conclusion.
- Missing response stays missing; do not impute neutral values.
- Report feedback response denominator alongside averages.

## Operator review

For each cohort version, report:

- response count;
- average final usability;
- average manual-edit effort;
- average error helpfulness;
- average reuse intent;
- repeated confusing steps, manually coded with examples redacted.

Use feedback with trajectory evidence for GO/HOLD/CANCEL; never use it alone to claim AI-TFES
quality superiority.

