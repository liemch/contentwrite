# WP2.7 Cohort Runbook — Đo chất lượng bài thật

> Mục tiêu: 10+ bài qua pipeline, thu editor feedback, xuất metrics — **không tune prompt/ngưỡng giữa chừng**.

## Trước khi bắt đầu

1. Xác minh deployment SHA: Settings → **Deployment version** (hoặc `GET /api/health/version`).
2. Ghi nhận `aiTfesVersion` đang chạy (`v2-rc2` trên main với quality-first ON).
3. Copy manifest mẫu:

```bash
cd web
cp scripts/cohort-manifest.example.json scripts/cohort-my-run.json
```

4. Sửa `cohortId`, `startedAt`, `notes`.

## Chạy cohort (10+ bài)

### Phân bổ đề xuất

| Loại | Số bài | Ghi chú |
|------|--------|---------|
| Hoàn thành bình thường | ≥5 | 2 domain trở lên |
| Revision remediation | ≥2 | Khi xảy ra tự nhiên |
| Fact remediation | ≥1 | Khi xảy ra tự nhiên |
| Exhausted + manual recovery | ≥1 | Thử `draft12` recovery |

### Quy tắc đóng băng

- **Cấm** sửa prompt, `pipeline-config.ts`, ngưỡng 85/90 trong lúc cohort.
- Mỗi thay đổi khẩn cấp → kết thúc cohort, tạo manifest mới.
- Mỗi bài xong → điền **Feedback WP2.7** (form trên trang bài khi `PUBLISH_READY` / exhausted).

### Sau mỗi bài

Thêm `articleId` vào `scripts/cohort-my-run.json`:

```json
"articleIds": ["clxxx...", "clyyy..."]
```

Validate manifest:

```bash
npm run db:validate:cohort -- scripts/cohort-my-run.json --strict
```

## Xuất metrics

```bash
npm run db:report:remediation -- --manifest scripts/cohort-my-run.json --format md
npm run db:report:remediation -- --manifest scripts/cohort-my-run.json --format json
```

So sánh với control v1.6 (nếu có bài cũ):

```bash
npm run db:report:remediation -- --manifest scripts/cohort-my-run.json --ai-tfes-version v2-rc2 --format json
```

## KPI chất lượng cần đọc

| KPI | Mục tiêu | Nguồn trong report |
|-----|----------|-------------------|
| Meta-leak rate | **0** | `quality.metaLeakRate` |
| Editor final usability | ≥4.0 avg | `editorFeedback.averageFinalUsability` |
| Manual edit effort | ≤2.5 avg | `editorFeedback.averageManualEditEffort` |
| Reuse intent | ≥4.0 avg | `editorFeedback.averageReuseIntent` |
| First-pass rate | Theo dõi | `firstPassRate` |
| Candidate retention | Cao | `candidateLock.retainedBestRate` |
| False Final MINOR suppressed | Đúng hướng | `finalMinorGuard.suppressedFinalMinorRate` |

## Quyết định sau cohort

| Kết quả | Hành động |
|---------|-----------|
| Meta-leak > 0 | Sửa scrubber/prompt publish — không hạ ngưỡng |
| Usability cao, false reject cao | Xem xét WP-QF-06 (ngưỡng) |
| Usability thấp | Sửa domain `gold_samples` / `anti_generic` |
| Pipeline ổn, feedback tốt | GO WP-E0A benchmark (optional) |
| Auto-write demand rõ | WP3-min |

## Liên kết

- [Editor feedback protocol](../product/editor-feedback-protocol.md)
- [Quality-first pipeline](../designs/quality-first-pipeline.md)
- [Quality expansion playbook](./quality-expansion-playbook.md)
