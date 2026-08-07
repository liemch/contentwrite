# Remediation Metrics — WP2.7

## Source of truth

- Cohort membership: explicit private manifest or bounded creation-date range.
- Workflow outcomes: `Article.workflowState`.
- Attempts/gates/timing: `WorkflowTransition.details.telemetry` (`wp2.7-v1`).
- Fact Check attempts: transition action `fact-check`; WP2.7.1 adds structured
  `details.telemetry.fact`.
- Convergence observations: optional `details.telemetry.convergence` (WP-V2-01).
- Candidate retention observations: lock-aware convergence fields (WP-V2-02).
- RC1 controller observations: `telemetry.finalMinorGuard`, `minorPreserve`,
  `autoAckBrake`, `aiTfesVersion`, and exact `aiTfesConfig`.
- Prompt Architecture observations: `telemetry.prompt` for registry version, machine contract,
  context characters, estimated tokens, defects, Lock residuals, and remediation medium.
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
| Editorial score monotonicity | Consecutive Editorial score pairs with delta ≥ 0 | Consecutive Editorial score pairs |
| Average Editorial score delta | Sum of consecutive Editorial score deltas | Consecutive Editorial score pairs |
| Candidate regression rate | Post-revision Editorial candidates with score below previous Editorial score | Post-revision Editorial candidates with comparable scores |
| Final regression rate | Final scores below the latest preceding Editorial score | Final attempts with comparable scores and no intervening draft-changing remediation |
| Average Final score delta | Sum of `Final score - latest Editorial score` | Comparable Final attempts |
| Retry convergence rate | Post-revision Editorial candidates with non-decreasing score | Post-revision Editorial candidates with comparable scores |
| Average rewrite count/article | `remediate-required-revision` transitions | All cohort articles |
| Lock candidate regression rate | Lock-aware comparable candidates below `bestScore - epsilon` | Lock-aware Editorial candidate comparisons |
| Rejected regression count | Regression candidates rejected by enabled lock | Count, not a rate |
| Retained-best rate | Rejected candidates whose best artifact was restored | Rejected candidates with an explicit restore outcome |
| Average rejected score delta | Sum of rejected `candidateScore - bestScore` | Rejected candidates with numeric delta |
| Exhaustion with best retained rate | Lock-enabled exhaustion events retaining best | Lock-enabled exhaustion events with a boolean retention outcome |
| Revision convergence rate | Completed revision-remediated articles without revision exhaustion | Articles with `remediate-required-revision` |
| Manual recovery rate | Exhausted articles using `manual-draft-revision` | Exhausted articles |
| False Final MINOR eligible rate | Craft-only high-quality Final MINOR observations | Lock-aware machine-readable Final MINOR observations |
| Suppressed Final MINOR rate | Eligible observations suppressed while guard enabled | Guard-enabled eligible observations |
| Post-suppression publish/lock rate | Suppressed Final transitions successfully entering Final lock | Suppressed Final MINOR events |
| Later human-correction rate | Suppressed articles with later allowlisted human action | Suppressed Final MINOR events |
| Auto-ack regression suppression rate | Regression auto-acks suppressed | Brake-enabled post-revision auto-ack opportunities |
| Regression loops interrupted rate | Brake events with no remediation before human pause/action | Human-brake events |
| Human intervention after brake rate | Brake events followed by Human Review/manual recovery | Human-brake events |
| Completion after brake rate | Completed articles exposed to a human brake | Human-brake events |
| Prompt architecture version events | Prompt telemetry events grouped by `1.6` / `2.0` | Count, not a rate |
| Average prompt context characters | Sum of `prompt.contextCharacterLength` by prompt ID | Prompt events for that ID |
| Average equivalent v1.6 context characters | Sum of `prompt.legacyContextCharacterLength` | Prompt events with a v1.6 comparison |
| Average estimated input tokens | Sum of `prompt.inputTokenEstimate` | Prompt events for that ID |
| Average prompt context reduction | Sum of `prompt.contextReductionRatio` | Prompt events with both context sizes |
| Prompt malformed rate | Prompt events with `prompt.malformedOutput=true` | Prompt events for that ID |
| Editorial malformed output rate | Editorial attempts with `prompt.malformedOutput=true` | Editorial attempts carrying a boolean malformed flag |
| Editorial format retry success rate | `editorial-review-format-invalid` events whose next Editorial attempt is machine-readable | `editorial-review-format-invalid` events |
| Editorial format retry exhaustion rate | `editorial-review-format-exhausted` events | Editorial format failure events (invalid + exhausted) |
| Parser failures causing human pause | `editorial-review-format-exhausted` events | Count, not a rate |
| False content-failure prevention count | Editorial format failure events that stayed out of the revision budget | Count, not a rate |

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

## Convergence telemetry (WP-V2-01)

Editorial Review, revision rewrite, and Final Verification transitions may contain an
additive `telemetry.convergence` object:

- `observation`: `editorial`, `rewrite`, or `final`.
- `currentScore`: score emitted by the current Editorial/Final observation.
- `previousEditorialScore`: latest prior machine-readable Editorial score.
- `scoreDelta`: `currentScore - previousEditorialScore`.
- `scoreDirection`: `improved`, `flat`, `declined`, or `unknown`.
- `candidateRegression`: true only when a post-revision Editorial candidate scores below
  the previous Editorial candidate.
- `finalRegression`: true only when Final scores below the latest Editorial candidate
  and no draft-changing remediation occurred between those observations.
- `retryConverging`: true when a post-revision Editorial score is non-decreasing. This is
  a direction metric, not proof that the article passed.
- `rewriteCount`: lifetime `remediate-required-revision` transition count in the workflow
  run.

These fields are observational only. They do not alter prompt selection, thresholds,
retry budgets, workflow state, candidate acceptance, or AI output.

### Backward compatibility

The report calculates convergence metrics from chronological transition actions and the
existing `telemetry.totalScore`, so runs recorded before WP-V2-01 remain measurable.
Nested `telemetry.convergence` enriches new events but is not required by the aggregator.
Missing or malformed scores are excluded from the relevant denominator rather than
inferred as zero.

## Best Candidate Lock telemetry (WP-V2-02)

Lock-aware Editorial rows extend `telemetry.convergence` with best/candidate scores, delta,
epsilon, accept/reject outcome, retained/rejected artifact revisions, flag state, and restore
status. Exhaustion rows additionally report `bestRetainedAtExhaustion`.

For these rows, `candidateRegression` uses the controller rule
`candidateScore < bestScore - epsilon`; the WP-V2-01 chronological trajectory metric remains
available separately under `convergence.candidateRegressionRate`.

The report's `candidateLock` section is deliberately not backfilled from legacy score pairs.
Only rows containing an explicit boolean `lockEnabled` participate. Therefore:

- a legacy row is unknown rather than accepted;
- a first candidate with no best is excluded from comparison denominators;
- missing restore outcomes are excluded rather than counted as failures;
- zero denominators return `null`.

## AI-TFES v2 RC1 telemetry

Every new remediation telemetry row records `aiTfesVersion` and the exact four behavior flag
exposures plus Candidate Lock epsilon. All behavior flags OFF produces `v1.6`; any RC1 behavior
flag ON produces `v2-rc1`.

- `finalMinorGuard` records deterministic eligibility, suppression, reason class, compared
  scores, Fact status, residual count, and flag state.
- `minorPreserve` records the prompt version and best-effort changed/unchanged section counts.
- `autoAckBrake` records eligibility, regression suppression, scores/delta/epsilon, reason,
  and Human Review routing.

Legacy rows without these nested objects are excluded from RC-specific denominators. The
report does not infer OFF, success, or failure from missing keys.

## Prompt Architecture v2 telemetry (WP-PV2-01)

Editorial Diagnosis, MINOR remediation, and Lock Verifier transitions record an additive
`telemetry.prompt` object:

- `promptId`, `promptVersion`, `contractVersion`, `role`, `source`;
- `promptArchitectureVersion`: `1.6` or `2.0`;
- `contextCharacterLength`;
- `legacyContextCharacterLength`;
- `contextReductionCharacters` and `contextReductionRatio`;
- `inputTokenEstimate`, currently `ceil(context chars / 4)`;
- phase-specific counts/outcomes such as `defectCount`, `remediationMedium`,
  `lockDecision`, `blockingResidualCount`, `falseMinorSuppressed`, and `malformedOutput`.

The context fields measure only assembled context, not full system/user prompt length. Token
estimates are comparative indicators, not provider billing tokens. Missing legacy comparisons are
excluded from reduction denominators.

`promptContextById` reports averages independently for:

- `editorial-diagnosis`;
- `minor-remediation`;
- `lock-verifier`.

Legacy rows without `telemetry.prompt` are unknown and excluded. Full prompts, article content,
defect prose, and claim text are never copied into telemetry.

## Editorial format reliability telemetry (WP-PV2-02)

A malformed Editorial machine output is a **format** defect and is recorded on its own
transitions, `editorial-review-format-invalid` (retry) and
`editorial-review-format-exhausted` (human pause). Both carry `errorClass="parser"`,
`totalScore=null`, `machineReadable=false`, and `revisionBudgetConsumed=false`, so a
parser defect can never be read as a quality score, a content verdict, or a spent
revision attempt.

`telemetry.prompt` on Editorial attempts additionally records:

- `parserVersion` — parser module that produced the result;
- `malformedReasonCode` — `no-machine-contract`, `json-unparseable`, `json-truncated`,
  `missing-total-score`, `missing-insight-score`, `placeholder-score`,
  `missing-decision`, `gates-incomplete`, or `degenerate-scores`;
- `rawOutputLength` — response length in characters, never the response body;
- `outputTruncated` — `known` when a marked object never closed, `suspected` when the
  response ends mid-token;
- `formatRetryCount` / `formatRetrySucceeded` — format-only retries spent in the
  current recovery cycle and whether the retry recovered.

The `editorialFormat` report section uses only rows that carry these fields. Rows written
before WP-PV2-02 have no `prompt.malformedOutput` and stay out of the denominator instead
of being counted as clean parses. `editorial-review-format-exhausted` is deliberately not
part of `EXHAUSTED_ACTIONS`: a parser pause is not content exhaustion and must not inflate
`exhaustionRate`.

Raw LLM responses are not copied into telemetry or transition details. The malformed
response is stored once as a `REVIEW` artifact — with no draft `sourceRevision`, so Best
Candidate Lock never maps it to a candidate — and is reused only to build the
format-repair prompt.

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
- Every convergence rate has an explicit comparison denominator. A single Editorial
  observation produces `null` monotonicity/delta rates, not a synthetic success.

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

Control/RC comparison over the same bounded manifest:

```bash
npm run db:report:remediation -- --manifest <cohort.json> --ai-tfes-version v1.6 --format json
npm run db:report:remediation -- --manifest <cohort.json> --ai-tfes-version v2-rc1 --format json
npm run db:report:remediation -- --manifest <cohort.json> --ai-tfes-version v2-rc2 --format json
```

The script refuses an unbounded whole-database scan.

