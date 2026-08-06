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

## Quy tắc WP

- Một WP = một PR logic; implement tuần tự.
- Mỗi WP có acceptance criteria + rollback.
- Không gộp security + migration + refactor trong một lần.

Xem [roadmap.md](../roadmap.md) cho timeline.
