# Remediation Metrics — WP2.7

## Source of truth

- Cohort membership: explicit private manifest or bounded creation-date range.
- Workflow outcomes: `Article.workflowState`.
- Attempts/gates/timing: `WorkflowTransition.details.telemetry` (`wp2.7-v1`).
- Manual revisions: `manual-draft-revision`.
- Feedback: `Article.deskJson.validationFeedback`.

The report is read-only and does not inspect artifact content, prompts or credentials.

## Metric definitions

| Metric | Numerator | Denominator |
|---|---|---|
| First-pass rate | Completed article with zero revision/fact remediation | All cohort articles |
| Remediation pass rate | Remediated article later completed without exhaustion | Articles with remediation |
| Exhaustion rate | Article with revision/fact/format exhausted event | All cohort articles |
| Average remediation attempts | Revision + fact remediation transitions | All cohort articles |
| Gate fail distribution | Count of telemetry `gateFailures` by G1–G8 | Counts, not a rate |
| Parse-format failure rate | `final-verification-format-invalid` events | All Final Verification attempts |
| Timeout rate | Telemetry events classified `timeout` | All telemetry events |
| Average `llmMs` | Mean persisted latency by transition/phase | Events with non-null `llmMs` |
| Draft truncation indicator | Short-for-target or missing expected section | All cohort articles |
| Recovery success rate | Manual draft revision followed by Editorial Review pass | Manual recovery attempts |
| Manual intervention rate | Article with allowlisted human/manual action | All cohort articles |

## Interpretation rules

- Null denominator produces `null`, never `0%`.
- `llmMs` is provider-call timing where persisted; unavailable remains null.
- Draft truncation is an **indicator**, not proof. Inspect missing sections and target length before
  assigning root cause.
- Score trend compares first and last persisted review score:
  `improved`, `flat`, `declined`, or `unavailable`.
- G1–G8 distribution uses exact parsed gate codes; free-text keyword inference is forbidden.
- Feedback averages only include submitted responses.

## Command

```bash
cd web
npm run db:report:remediation -- --manifest <cohort.json> --format json
```

Alternative bounded query:

```bash
npm run db:report:remediation -- \
  --since 2026-08-07T00:00:00Z \
  --until 2026-09-07T00:00:00Z \
  --format md
```

The script refuses an unbounded whole-database scan.

