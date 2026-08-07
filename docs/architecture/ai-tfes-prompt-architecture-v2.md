# AI-TFES Prompt Architecture v2

**Status:** Design proposal only
**Production impact:** None
**Evidence date:** 2026-08-07
**Companions:** `ai-tfes-prompt-contracts-v2.md`, `ai-tfes-context-map-v2.md`,
`ai-tfes-prompt-migration-plan.md`

## 1. Decision

AI-TFES v2 replaces the current “shared operating prompt + phase instruction + large mixed
context” pattern with a versioned prompt registry. Every prompt has one primary role, a typed
input boundary, a typed output contract, explicit immutable inputs, and phase-specific KPIs.

This proposal does not overwrite v1.6 prompts, alter the workflow, or authorize implementation.
Sample prompts live under repository-root `AI-TFES-v2-proposal/`, which production must not
import.

## 2. Evidence and design posture

Evidence:

- Production trajectory: Editorial 85 / gate 0 PASS → Fact PASS → Final 85 MINOR →
  remediation → Editorial 63 → remediation → Editorial 56 → exhausted.
- WP2.5–WP2.7.1 verified context delivery, retry, parser, Fact loop, recovery, and telemetry.
- WP-V2-01–05 add convergence measurement and deterministic safeguards, but do not replace
  the underlying full-draft remediation medium.
- Current `finalize-revision-remediate` always returns a complete Article.md, including MINOR.
- Editorial and Final share G1–G8 and broad craft scoring while using different acceptance bars.

Therefore:

- Full-draft rewrite under a second global judge is an evidence-backed convergence failure.
- Prompt dilution is plausible but remains a hypothesis until isolated.
- Patch superiority, typed-defect accuracy, partial Fact invalidation, and delta-only Lock safety
  require A/B validation.

## 3. Current production prompt surface

There are **19 active task prompts** in the core article pipeline: 17 unique active
`buildPipelinePrompt` step IDs plus 2 Research prompt builders. There are also **2 cross-cutting
system wrappers**, **4 TFES-adjacent auxiliary LLM prompts**, and **4 legacy task prompts** still
defined but not called by the current workflow. The broad runtime inventory therefore contains
**25 active LLM-facing prompt identities/components**, of which 19 control the article pipeline.
Full inventory and disposition are in the migration plan.

Active prompt groups:

1. Research call: `Daily-Task` + `buildResearchPrompt` in one LLM request.
2. Insight/plan: `insight-a`, `insight-decision`, `insight-planning`.
3. Draft: `write-a`, `write-b`.
4. Quality: `finalize-review`, `finalize-a`, `finalize-verify`,
   `finalize-reader-sim`.
5. Remediation: `finalize-revision-remediate`, `finalize-fact-remediate`,
   `finalize-repair`, `finalize-expand`, `finalize-polish`,
   `finalize-human-polish`.
6. Packaging: `finalize-b`, `finalize-hero`.

Legacy definitions to retire after proving no runtime caller:

- `insight`
- `insight-b`
- `write`
- `finalize`

System prompt layers (`getSystemPrompt`, `getSystemPromptLite`) are cross-cutting envelopes, not
task prompts. In v2 they become small policy modules selected by prompt role; they must not
restate the entire pipeline.

Auxiliary runtime prompts are:

- trend seed-topic generation;
- image brief generation;
- visual-grounding critique;
- weekly digest generation.

They do not control the article convergence loop, but they belong in the broad inventory because
they are live LLM calls under TFES/TFES-adjacent modules. Deterministic Tavily web search is not
counted as a prompt.

## 4. Single-responsibility model

Every v2 prompt has exactly one primary role:

| Role | May do | Must not do |
|---|---|---|
| RESEARCH | Verify sources, synthesize evidence, expose limitations | Plan article, write prose, score draft |
| PLAN | Lock thesis, audience, outline, preserve policy | Draft article, fact-audit claims |
| GENERATE | Create a new artifact from locked upstream inputs | Self-approve, invent evidence, diagnose defects |
| DIAGNOSE | Score and emit typed defects | Rewrite article or suggest untyped “make better” prose |
| AUDIT | Map claims to evidence and verdicts | Rewrite narrative or score craft |
| PATCH | Apply listed defects inside an allowed mutation surface | Re-score globally, change frozen context |
| LOCK | Verify evidence/open actions/regression against frozen candidate | Rejudge passed craft globally, invent repairs |

Hard separation:

- A diagnoser never emits Article.md.
- A patcher never emits a new global quality score.
- A Fact auditor never rewrites narrative.
- A Lock verifier never invents repair text.
- The deterministic controller—not an LLM—accepts/rejects candidates, consumes budgets, and
  promotes best candidate.

## 5. Proposed prompt sequence

```text
research-packet@2.0            [RESEARCH]
        ↓ immutable Research Packet
insight-lock@2.0               [PLAN]
        ↓ immutable Thesis + Outline Lock
draft-generation@2.0           [GENERATE]
        ↓ Candidate v0
editorial-diagnosis@2.0        [DIAGNOSE]
        ↓ typed defects + provisional score
fact-audit@2.0                 [AUDIT]
        ↓ Claim Ledger bound to candidate revision
lock-verifier@2.0              [LOCK]
        ↓ PASS or typed blocking residuals
publish-renderer@2.0           [GENERATE]
        ↓ reader-facing package
reader-audit@2.0               [AUDIT, non-global]
```

Remediation routing:

```text
CRAFT_LOCAL / STYLE / FLOW
  → minor-remediation@2.0

STRUCTURE_MULTI_SECTION / PRACTICAL_VALUE / LOGIC_LOCAL
  → major-remediation@2.0

CLAIM / EVIDENCE / SOURCE_BINDING
  → fact-remediation@2.0

INSIGHT_INVALID / CATASTROPHIC_STRUCTURE
  → rewrite-remediation@2.0
```

Every candidate returns to the affected verifier(s), then the deterministic controller compares
it with best. Rewrite is escalation, not the default remediation representation.

## 6. Immutable context policy

| Artifact | Locked after | Default mutation policy |
|---|---|---|
| Research Packet | Research evidence validation | Immutable; refresh only via explicit research-refresh run |
| Thesis Lock | Insight/Planning approval | Immutable except typed `THESIS_INVALID` defect + human/controller approval |
| Outline Lock | Planning approval | Preserve by default; MAJOR/REWRITE needs explicit allowed section operations |
| Candidate revision | Artifact creation | Immutable snapshot; never edit in place |
| Best Candidate | Editorial diagnosis + controller promotion | Immutable reference; only controller promotes a different revision |
| Defect Log | Each diagnosis/lock event | Append-only; defect state may close/reopen, history remains |
| Claim Ledger | Fact audit of candidate revision | Immutable per revision; explicitly invalidate touched claim IDs |
| Lock Decision | Lock verification | Immutable per candidate/ledger pair |
| Human Decision | Human review | Immutable audit event; highest-priority instruction within its scope |

Remediation may mutate only:

- defect IDs supplied to the prompt;
- target sections/claim spans supplied in the mutation envelope;
- fields listed in `allowedMutations`.

Everything else is preserved and returned as checksums/references, not copied as “helpful”
context.

## 7. Prompt contract envelope

Every prompt follows the same top-level structure:

```text
PROMPT_ID
VERSION
CONTRACT_VERSION
ROLE
GOAL

IMMUTABLE INPUTS
MUTABLE INPUTS
TASK
PRESERVE
FORBIDDEN
OUTPUT CONTRACT
MACHINE OUTPUT
FAILURE BEHAVIOR
TOKEN BUDGET
TELEMETRY
SUCCESS KPI
```

Contract rules:

- `promptId`, `version`, and `contractVersion` are independent.
- Output is either valid machine data or an explicit failure envelope; prose never substitutes
  for required fields.
- Human-readable explanation is optional and separated from machine output.
- Prompt files contain no workflow transition rules.
- Runtime supplies IDs, revisions, checksums, and timestamps; the model never invents them.

## 8. Registry and version selection

Proposed registry key:

```text
promptId@version / contractVersion
editorial-diagnosis@2.0 / editorial-diagnosis.v2
minor-remediation@2.0 / section-patch.v1
fact-audit@2.0 / claim-ledger.v2
lock-verifier@2.0 / lock-decision.v2
```

Registry record:

- prompt ID and semantic version;
- contract version;
- role;
- template path and checksum;
- compatible model capabilities;
- input/output schema IDs;
- token budget;
- feature flag/cohort;
- fallback prompt version;
- status: `proposal | shadow | canary | active | retired`.

Production selection must be explicit per phase and persisted in telemetry/artifact metadata.
Never overwrite v1.6 content in place.

## 9. Responsibility boundaries by phase

### Research

Produces evidence and limitations only. Editorial Memory is a deduplication hint, not evidence.
Search content is untrusted data. The model may reject insufficient evidence but may not invent
sources or choose a publish decision.

### Insight / Planning Lock

Produces one thesis, audience, objective, outline, and preserve policy. It consumes a validated
Research Packet and does not repeat source synthesis.

### Draft Generation

Generates Candidate v0 against locked Research and Plan. It does not score itself. Write-A/B may
remain transport chunks, but share one logical prompt contract and continuation cursor.

### Editorial Diagnosis

Diagnoses craft, structure, practical value, insight alignment, and intellectual honesty. It
returns typed defects with stable IDs, locations, severity, evidence references, allowed mutation
surface, and provisional score. It never emits replacement prose.

### Fact Audit

Extracts claims and maps them to Research evidence. It emits stable claim IDs, source IDs,
verdict, confidence, and required action. It does not modify the candidate.

### Remediation

- MINOR: minimum section/claim patch; title/outline/thesis frozen unless explicitly targeted.
- MAJOR: constrained multi-section patch with explicit preserve mask.
- REWRITE: new full candidate only when controller authorizes; passed sections/claims remain in
  preserve mask.
- FACT: claim-local replace/hedge/delete operations only.

### Final / Lock

Verifies Fact status, blocking claims, open required actions, evidence lock, insight floor, closed
defects, and regression metadata. It does not re-score the complete craft surface already passed
by Editorial. Craft-only nits become optional polish actions, never full rewrite triggers.

### Human review support

Transforms machine defects, candidate comparison, and available recovery actions into a concise
decision packet. It never decides on behalf of the human or rewrites the draft.

## 10. Context packing principles

1. Put task contract first.
2. Put typed defects/actions before content.
3. Put immutable references/checksums before mutable spans.
4. Include only target spans plus local neighbors for PATCH.
5. Include only cited evidence excerpts for affected claims.
6. Never include full workflow history; include current open defect set and latest relevant
   decision.
7. Do not include Editorial prose in Fact Audit when typed defect/claim IDs suffice.
8. Do not include Research Packet in Lock unless a disputed evidence binding needs it.
9. Clip at semantic boundaries (source, section, claim), never arbitrary prefix/suffix.
10. If required context cannot fit, return `CONTEXT_INCOMPLETE`; do not guess.

Detailed budgets and ordering are in `ai-tfes-context-map-v2.md`.

## 11. Evaluation model

No shared “quality score” is used as the only success measure.

| Prompt | Primary KPIs |
|---|---|
| Research Packet | evidence lineage coverage, URL validity, contradiction capture, unsupported-source rate |
| Insight Lock | thesis stability, downstream thesis-change rate, plan completeness |
| Draft Generation | contract completeness, first Editorial score, citation/source adherence |
| Editorial Diagnosis | machine-readable rate, decision stability, defect-location precision, human agreement |
| Fact Audit | claim coverage, verdict agreement, blocking-claim precision/recall, malformed rate |
| MINOR/MAJOR Patch | defect closure, changed-surface ratio, score delta, regression rate |
| Rewrite | preserve-mask compliance, score delta, new-defect rate |
| Fact Remediation | blocking-claim reduction, touched-claim precision, new-claim count |
| Lock | false-MINOR rate, lock pass rate, escaped blocking defect rate |
| Reader Audit | actionable polish precision, completion after one polish, no global rewrite rate |

Global:

- Editorial score monotonicity;
- candidate regression and best-candidate retention;
- convergence within budget;
- exhaustion and human intervention;
- tokens and latency per completed article;
- defect closure per LLM call;
- Fact re-audit volume;
- editor usability/reuse intent.

## 12. Highest-risk conflicts in v1.6

1. `finalize-revision-remediate` combines diagnosis interpretation with full generation and is the
   highest regression risk.
2. `finalize-verify` repeats broad craft judgment after Editorial PASS and can trigger a full
   rewrite from a five-point bar disagreement.
3. `finalize-review` uses narrative Review.md plus trailing machine lines, forcing parser
   reconciliation and rejudging the whole article after every rewrite.
4. `finalize-fact-remediate` replaces the entire draft for claim-local failures.
5. `finalize-b` and `finalize-polish` both reshape the complete reader-facing article, creating a
   second generation/remediation loop after lock.
6. Full and Lite system prompts still carry cross-phase prohibitions that duplicate task prompts.

## 13. First three prompts to migrate

If only three prompts can migrate:

1. **`editorial-diagnosis@2.0`** — creates typed defect IDs and mutation scopes required by every
   safer remediation path.
2. **`minor-remediation@2.0`** — directly removes the proven full-rewrite trigger in the
   85→63→56 trajectory.
3. **`lock-verifier@2.0`** — removes the asymmetric second global craft judge that initiated the
   production death spiral.

`minor-remediation@2.0` and `lock-verifier@2.0` require A/B testing. Editorial Diagnosis may run
in shadow mode first because it can be compared without controlling workflow.

