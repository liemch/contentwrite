# Next Investment Decision

> Date: 2026-08-07  
> Decision horizon: next 30–90 days  
> Evidence source: [review synthesis](./review-synthesis.md)  
> Constraint: choose one next Work Package.

## Decision

# DO AFTER PRODUCT VALIDATION

Do not start WP-E0A Editorial Trajectory Benchmark now.

The benchmark remains strategically valid and technically well designed. It should start after
ContentWrite produces enough real workflow evidence to select representative topics, failure
modes, interventions, and quality criteria.

## The one Work Package to do next

## WP2.7 — Production Validation & Measurement

This package has a higher value/cost ratio than WP-E0A because it simultaneously:

- validates whether WP2.5/WP2.6 fixed the production remediation loop;
- reduces immediate operational risk;
- proves manual recovery paths;
- creates the trajectories and editor labels needed by the future benchmark;
- reveals whether onboarding or reliability is the actual bottleneck;
- gives direct evidence for whether AI-TFES is worth comparing against direct chat.

It is one package with one outcome:

> Produce a trustworthy post-WP2.6 production evidence set that shows how real articles
> complete, fail, recover, and are judged by editors.

## Minimum scope

### 1. Production validation cohort

- Run at least 10 representative real article workflows across at least two existing domains.
- Include normal completion, revision remediation, fact remediation, and final-verification
  outcomes when they occur naturally.
- Do not tune prompts, thresholds, or retry limits during the cohort. Any emergency change
  ends the cohort version and starts a new one.

### 2. Minimal measurement record

For every attempt, record:

- article/domain and start/end timestamps;
- terminal workflow state;
- time-to-first-draft and time-to-publish;
- revision/fact remediation attempts;
- gate failures and required revisions;
- manual interventions and recovery action;
- final editor score (1–5) and accept/reject decision;
- cost proxy or available provider usage;
- abandonment or incomplete reason.

Use the existing workflow artifacts/transitions where possible. A simple structured export or
review worksheet is sufficient. Do not build the benchmark kernel, Promptfoo adapter, sandbox,
or public verifier in WP2.7.

### 3. Manual recovery validation

For each observed failed or paused trajectory:

- document the operator action required;
- confirm whether the article can safely resume without data loss or duplicate paid calls;
- record recovery time and resulting state;
- classify missing recovery as a product/reliability defect, not an editor mistake.

At minimum, explicitly exercise:

- revision remediation exhaustion;
- provider/search failure or timeout;
- stale/paused workflow requiring editor intervention.

### 4. Editor/product signal

- Collect a final quality rating and short rationale for every completed article.
- Ask whether the result is better, similar, or worse than the editor's normal direct-chat
  process.
- Record whether the audit trail and gate feedback helped the editor make a decision.
- Record onboarding confusion and where the editor needed support.

This is directional product validation, not the blinded benchmark.

### 5. Outcome report

Produce one versioned report with:

- completion and failure denominators;
- remediation success rate;
- time-to-publish distribution;
- intervention/recovery distribution;
- editor quality/acceptance results;
- observed comparison with direct-chat workflow;
- top three reliability or onboarding bottlenecks;
- recommendation to start WP-E0A, improve product/reliability first, or simplify AI-TFES.

## Definition of Done

WP2.7 is complete when:

- 10 representative workflows have valid outcome records;
- production behavior after WP2.5/WP2.6 is explicitly assessed;
- every observed failure has a documented recovery outcome;
- editor quality and direct-chat comparison feedback exist for completed articles;
- completion, failure, intervention, and time-to-publish metrics can be recomputed;
- no production secret or licensed source content is copied into public docs;
- one evidence-based investment decision is recorded.

## Gate for starting WP-E0A

Start WP-E0A only if all conditions are true:

1. **Data sufficiency:** at least 10 completed, reviewable trajectories across two domains.
2. **Human signal:** feedback comes from at least three real editor/user sessions, or from the
   primary editor plus two independent external reviewers.
3. **Workflow stability:** no unresolved P0/P1 failure prevents representative articles from
   reaching a reviewable final state.
4. **Recovery readiness:** observed failures can be recovered safely, or are explicitly
   classified and excluded by a preregistered rule.
5. **Measurement completeness:** artifacts, transitions, timing, interventions, and editor
   labels are available for dataset/protocol design.
6. **Strategic relevance:** editors still report a plausible quality or decision-making
   advantage over direct chat that warrants controlled testing.
7. **Named benchmark inputs:** two domains, topic-selection rule, source-license policy, and
   human annotator/reviewer availability are known.

If the gate passes, begin the already-reviewed WP-E0A scope without reopening its architecture.

## No-go outcomes after WP2.7

Do not start WP-E0A yet if any of these is true:

- too few users or completed workflows exist to select representative cases;
- production/recovery failures dominate the cohort;
- editors cannot understand or complete the workflow without heavy support;
- quality feedback does not indicate a plausible advantage over direct chat;
- the audit trail is not used in editorial decisions;
- required source licensing or independent reviewers are unavailable.

In those cases, use the WP2.7 evidence to choose a later product or reliability package. This
document intentionally does not select that later package because the current decision requires
exactly one next investment.

## Opportunity-cost decision

| Candidate | Direct value now | Decision data produced | Cost/risk | Decision |
|-----------|------------------|------------------------|-----------|----------|
| WP-E0A benchmark feasibility | Low | Research architecture feasibility | Medium; opens a multi-WP program | After validation |
| WP2.7 Production Validation & Measurement | High | Production, recovery, quality, onboarding, benchmark-readiness data | Small–Medium | **Do next** |
| Guided onboarding only | Medium–High | Activation data | Does not validate remediation/recovery | Not selected |
| Observability only | High operational | Failure data | Weak editor/product signal | Included minimally in WP2.7 |
| Manual recovery only | High for incidents | Recovery data | Narrow; no quality/adoption signal | Included as validation in WP2.7 |

## Why this is not POSTPONE or CANCEL

The benchmark answers a real unresolved question and the four review streams produced a coherent
implementation plan. It should not be cancelled.

The delay is evidence-gated, not indefinite. WP2.7 directly creates the missing prerequisites.
The investment decision should be revisited immediately when its Definition of Done is met, or
after 45 days if the cohort cannot be assembled.

## Treatment of the two misleading signals

### Node unavailable

Do not treat the Live DevEx shell's missing `node` command as evidence against WP-E0A or
ContentWrite. It is an environment/PATH discrepancy that must be checked in the eventual
implementation terminal. Earlier assessments successfully ran Node/npm quality gates.

### Live DX 0.8/10

Do not use this score to prioritize a redesign of the existing ContentWrite application. The
score measures only the unimplemented benchmark verifier/CLI/documentation path. It correctly
shows that benchmark tooling creates no current user value, which supports doing WP2.7 first.

