# Quality Expansion Playbook

> Hướng dẫn vận hành mở rộng **chất lượng bài** — craft trước, infrastructure sau.

## Ba tầng đã triển khai

### Tầng A — Vận hành (làm ngay)

| Hạng mục | Trạng thái | Cách dùng |
|----------|------------|-----------|
| Cohort WP2.7 | Runbook + manifest | [wp27-cohort-runbook.md](./wp27-cohort-runbook.md) |
| Editor feedback 1–5 | UI có sẵn | Form trên trang bài sau `PUBLISH_READY` |
| Gold samples 3/domain | ✅ Domain profiles | `AI-TFES/04-Domain-Profiles/*.md` |
| Anti-generic per domain | ✅ Prompt + profile | Mục `anti_generic_and_realism` |

### Tầng B — Pipeline quality-first (đã ON trên main)

| Flag | Tác dụng |
|------|----------|
| `bestCandidateLock` | Giữ draft tốt nhất |
| `minorPreservePrompt` | Sửa MINOR không phá cấu trúc |
| `falseFinalMinorGuard` | Không mở vòng craft giả |
| `regressionAutoAckBrake` | Pause khi regression |
| `promptArchitecture` v2 RC2 | Prompt tách tầng máy/reader |
| Reader meta scrubber | `publish-content.ts` |

Ngưỡng 85/90: **giữ nguyên** cho tới khi cohort có evidence (WP-QF-06).

### Tầng C — Sau cohort

- WP-QF-06: revisit ngưỡng nếu false reject / weak-pass có số liệu
- WP-E0A: Editorial Trajectory Benchmark
- Editorial memory: publish bài ≥4 → tự nuôi gold samples

## Domain profile — checklist khi thêm domain

1. Đủ field theo `Domain-Profile-Schema.md`
2. ≥2 `gold_samples` (khuyến nghị 3)
3. Mục `anti_generic_and_realism` theo domain
4. `scoring_weights` tổng = 100
5. Chạy `npm test` — `domain-profile.test.ts` validate merge

## Editorial memory vòng lặp

```
Publish bài editor score ≥4
  → approve gate gợi ý nuôi memory
  → append gold sample vào TfesDocument override
  → bài mới có voice reference tốt hơn
```

## Scripts hữu ích

```bash
cd web

# Validate cohort manifest
npm run db:validate:cohort -- scripts/cohort-my-run.json --strict

# Metrics report (read-only)
npm run db:report:remediation -- --manifest scripts/cohort-my-run.json --format md

# Sync domain profiles sau khi sửa AI-TFES/
node scripts/sync-tfes.mjs
```

## Không làm (trừ khi cohort chứng minh)

- Hạ ngưỡng 85/90 mù
- Tăng retry 3→5
- Thêm gate mới
- Auto-write full trước khi quality ổn
- Microservice/worker cho throughput

## Liên kết

- [Project health](../project-health.md)
- [Quality-first design](../designs/quality-first-pipeline.md)
- [Next-step recommendation](../next-step-recommendation.md)
