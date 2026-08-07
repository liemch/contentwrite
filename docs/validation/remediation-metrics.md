# Remediation Metrics — WP2.7

## Source of truth

- Cohort membership: explicit private manifest or bounded creation-date range.
- Workflow outcomes: `Article.workflowState`.
- Attempts/gates/timing: `WorkflowTransition.details.telemetry` (`wp2.7-v1`).
- Fact Check attempts: transition action `fact-check`; WP2.7.1 adds structured
  `details.telemetry.fact`.
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
| Average Fact Check attempts/article | `fact-check` transitions | All cohort articles |
| Fact first-pass rate | Article whose first `fact-check` has `success=true` | Articles with at least one `fact-check` |
| Fact remediation pass rate | Article with `remediate-fact-check` followed by successful `fact-check` | Articles with at least one `remediate-fact-check` |
| Blocking claim distribution | Fact Check attempts grouped by `fact.blockingClaimCount` | Fact Check attempts with numeric blocking count |
| Unsupported claim distribution | Fact Check attempts grouped by `fact.unsupportedClaimCount` | Fact Check attempts with numeric unsupported count |
| Claims-without-source distribution | Fact Check attempts grouped by `fact.claimsWithoutSourceCount` | Fact Check attempts with numeric missing-source count |
| Malformed Fact output rate | Fact Check attempts with `fact.malformedOutput=true` | Fact Check attempts with a boolean malformed flag |

## Fact Check telemetry (WP2.7.1)

Every new `fact-check` transition records the common remediation fields plus:

- `attempt`: Fact Check attempt number inside the current cycle.
- `cycleRemediationCount`: same current-cycle Fact Check attempt count used by the
  timeline.
- `lifetimeRemediationCount`: all Fact Check attempts retained in the workflow run.
- `decision`: parsed Verification Status, or `UNPARSED`.
- `failureReasons[0]`: redacted and length-limited reason generated from the existing
  pass/blocking-claim checks.
- `machineReadable` / `machineContract`: whether the existing Fact Ledger parser could
  read the output.
- `draftCharacterLength`, `maxTokens`, `llmMs`, `errorClass`, and deployment version.
- `fact.verdict`.
- `fact.claimCount`.
- `fact.blockingClaimCount`.
- `fact.unsupportedClaimCount`.
- `fact.unverifiableClaimCount`.
- `fact.claimsWithoutSourceCount`.
- `fact.malformedOutput`.

These are counts and parser outcomes only. Telemetry does not include claim text, full
source content, prompts, article content, credentials, or API keys. Citation mismatch is
not reported because the current parser has no trustworthy citation-mismatch signal.

### Legacy Fact Check transitions

Transitions written before WP2.7.1 contain `details.verificationStatus` and
`details.blockingClaims`, but no `details.telemetry`. The timeline uses a read-only legacy
adapter to show those historical `fact-check` rows without rewriting the database.

The metrics report counts legacy rows as Fact Check attempts and can use their persisted
`success` value for first-pass/remediation outcomes. It excludes them from fact-specific
distributions and malformed-output rate because unsupported, missing-source, and malformed
fields were not persisted. The corresponding denominators therefore make this missing
coverage explicit instead of treating legacy unknowns as zero.

### Attempt, cycle, and lifetime

- `attempt` and `cycleRemediationCount` describe the current Fact Check cycle shown in the
  timeline.
- `lifetimeRemediationCount` is audit history for the workflow run and never resets.
- A cycle anchor changes the live retry window but does not delete transitions or
  artifacts.
- In the report, `factCheck.averageAttemptsPerArticle` uses all cohort articles as its
  denominator. The first-pass and remediation-pass rates use article-level denominators
  shown under `metrics.denominators`.
- Distribution objects are histograms: key `2` means “attempts with two findings”; the
  value is the number of attempts in that bucket.

## Interpretation rules

- Null denominator produces `null`, never `0%`.
- `llmMs` is provider-call timing where persisted; unavailable remains null.
- Draft truncation is an **indicator**, not proof. Inspect missing sections and target length before
  assigning root cause.
- Score trend compares first and last persisted review score:
  `improved`, `flat`, `declined`, or `unavailable`.
- G1–G8 distribution uses exact parsed gate codes; free-text keyword inference is forbidden.
- Feedback averages only include submitted responses.
- Every Fact Check metric has a named denominator. A zero denominator produces `null`;
  legacy unknown fields are never inferred as zero.

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

