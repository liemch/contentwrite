# Work Packages

Danh sách Work Package cho lộ trình multi-user ContentWrite.

| WP | File | Status |
|----|------|--------|
| WP0-A | [WP0-A-security-multi-user-isolation.md](./WP0-A-security-multi-user-isolation.md) | **Done** |
| WP0-B | [WP0-B-security-completion.md](./WP0-B-security-completion.md) | **Done** |
| WP1 | [WP1-database-deployment-safety.md](./WP1-database-deployment-safety.md) | **Done** |
| WP2 | [WP2-quality-gate-vercel.md](./WP2-quality-gate-vercel.md) | **Done** |
| WP3-min | Chưa tạo WP — xem [next-step recommendation](../next-step-recommendation.md) | Decision-gated |
| WP4 | WP4-performance-quick-wins.md | Planned |
| WP5 | WP5-workflow-maintainability.md | Planned |
| WP-PV2-02 | [WP-PV2-02-editorial-format-reliability.md](./WP-PV2-02-editorial-format-reliability.md) | **Done** |
| WP-QF-01 | [WP-QF-01-publish-best-draft.md](./WP-QF-01-publish-best-draft.md) | **Done** |
| WP-QF-02 | [WP-QF-02-context-budget.md](./WP-QF-02-context-budget.md) | **Done** |
| WP-QF-03 | [WP-QF-03-severity-remediation.md](./WP-QF-03-severity-remediation.md) | **Done** |
| WP-QF-04 | [WP-QF-04-dual-score-collapse.md](./WP-QF-04-dual-score-collapse.md) | **Done** |
| WP-QF-05 | [WP-QF-05-prompt-language-split.md](./WP-QF-05-prompt-language-split.md) | **Done** |
| WP-QF-06 | [WP-QF-06-threshold-revisit.md](./WP-QF-06-threshold-revisit.md) | **Decision: floors unchanged** |

Quality-first design: [../designs/quality-first-pipeline.md](../designs/quality-first-pipeline.md)

## Quy tắc WP

- Một WP = một PR logic; implement tuần tự.
- Mỗi WP có acceptance criteria + rollback.
- Không gộp security + migration + refactor trong một lần.

Xem [roadmap.md](../roadmap.md) cho timeline.
