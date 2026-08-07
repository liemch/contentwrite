# AI-TFES Prompt Contracts v2

**Status:** Proposal; not imported by production
**Prompt semantic baseline:** 2.0
**Contract baseline:** v2

## 1. Canonical prompt template

Every prompt specification must contain:

```yaml
PROMPT_ID: string
VERSION: semver
CONTRACT_VERSION: string
ROLE: RESEARCH | PLAN | GENERATE | DIAGNOSE | AUDIT | PATCH | LOCK
GOAL: one sentence

IMMUTABLE_INPUTS:
  - schema/ref, required, max size, integrity rule
MUTABLE_INPUTS:
  - schema/ref, allowed mutation scope
TASK:
  - ordered operations
PRESERVE:
  - frozen fields/spans/checksums
FORBIDDEN:
  - phase violations
OUTPUT_CONTRACT:
  schema: schema id
  encoding: JSON | JSONL | fenced blocks | Markdown
MACHINE_OUTPUT:
  required fields and enums
FAILURE_BEHAVIOR:
  explicit error codes; never silently guess
TOKEN_BUDGET:
  input and output budgets
TELEMETRY:
  fields emitted by runtime/model parser
SUCCESS_KPI:
  phase-specific metrics and denominators
```

Runtime owns IDs, versions, timestamps, hashes, candidate acceptance, retry budgets, and state.
The model owns only fields explicitly marked model-generated.

## 2. Shared machine envelopes

### 2.1 Success/failure envelope

```json
{
  "contractVersion": "prompt-result.v2",
  "promptId": "editorial-diagnosis",
  "promptVersion": "2.0.0",
  "status": "OK",
  "result": {},
  "warnings": []
}
```

Failure:

```json
{
  "contractVersion": "prompt-result.v2",
  "promptId": "editorial-diagnosis",
  "promptVersion": "2.0.0",
  "status": "CONTEXT_INCOMPLETE",
  "missingInputs": ["candidate.body"],
  "safeToRetry": true
}
```

Allowed failure statuses:

- `CONTEXT_INCOMPLETE`
- `CONTRACT_UNSUPPORTED`
- `OUTPUT_TRUNCATED`
- `EVIDENCE_INSUFFICIENT`
- `TARGET_NOT_FOUND`
- `PRESERVE_CONFLICT`

No prose fallback is parsed as success.

### 2.2 Typed defect

```json
{
  "defectId": "D-0007",
  "type": "CRAFT_LOCAL",
  "severity": "MINOR",
  "location": {
    "sectionId": "deep-analysis",
    "anchorStart": "The current retry policy",
    "anchorEnd": "without convergence evidence"
  },
  "diagnosis": "Two sentences repeat the same causal claim.",
  "requiredOutcome": "State the causal claim once and preserve the counterexample.",
  "allowedMutations": ["deep-analysis"],
  "evidenceRefs": [],
  "blocking": false
}
```

Defect types:

- `CRAFT_LOCAL`
- `FLOW_LOCAL`
- `STRUCTURE_SECTION`
- `STRUCTURE_MULTI_SECTION`
- `LOGIC`
- `PRACTICAL_VALUE`
- `INTELLECTUAL_HONESTY`
- `CLAIM`
- `EVIDENCE_BINDING`
- `INSIGHT_ALIGNMENT`
- `THESIS_INVALID`
- `CATASTROPHIC_STRUCTURE`

Severity is routing information, not permission to rewrite:

- `MINOR`: one or few local spans.
- `MAJOR`: bounded multi-section edits.
- `REWRITE`: controller-authorized new candidate with preserve mask.

### 2.3 Patch contract

```json
{
  "contractVersion": "article-patch.v1",
  "baseCandidateRevision": 4,
  "defectIds": ["D-0007"],
  "operations": [
    {
      "op": "replace_section",
      "sectionId": "deep-analysis",
      "expectedHash": "sha256:...",
      "contentMarkdown": "## Deep Analysis\n..."
    }
  ],
  "preservedSectionIds": ["title", "introduction", "references"],
  "newClaimIds": [],
  "closedDefectIds": ["D-0007"]
}
```

Runtime rejects a patch if base revision/hash, target, allowed mutation set, or preserved hashes
do not match.

### 2.4 Claim ledger v2

```json
{
  "contractVersion": "claim-ledger.v2",
  "candidateRevision": 4,
  "claims": [
    {
      "claimId": "C-001",
      "sectionId": "deep-analysis",
      "textHash": "sha256:...",
      "type": "FACT",
      "importance": "CENTRAL",
      "evidenceRefs": ["S-003#E-02"],
      "verdict": "SUPPORTED",
      "confidence": "HIGH",
      "requiredAction": null
    }
  ],
  "verificationStatus": "PASSED",
  "blockingClaimIds": [],
  "openActionIds": []
}
```

### 2.5 Lock decision v2

```json
{
  "contractVersion": "lock-decision.v2",
  "candidateRevision": 4,
  "factLedgerRevision": 2,
  "decision": "LOCKED",
  "factLock": "PASSED",
  "insightFloor": "PASSED",
  "blockingClaimIds": [],
  "unresolvedBlockingDefectIds": [],
  "openRequiredActionIds": [],
  "regressionDetected": false,
  "optionalPolishActions": []
}
```

Lock decisions:

- `LOCKED`
- `PATCH_REQUIRED`
- `FACT_PATCH_REQUIRED`
- `REWRITE_ESCALATION_REQUESTED`
- `CONTEXT_INCOMPLETE`

Lock never emits `MINOR_REVISION_REQUIRED` based on craft preference.

## 3. Core prompt contracts

### 3.1 `research-packet@2.0`

- **ROLE:** RESEARCH
- **GOAL:** Produce a source-grounded evidence packet with contradictions and limitations.
- **IMMUTABLE INPUTS:** topic, resolved Domain Profile source policy, search-result records,
  editorial-memory deduplication summary.
- **MUTABLE INPUTS:** none.
- **TASK:** validate source identity/date/lineage; extract evidence; cross-check; synthesize
  conditional findings; expose limitations.
- **PRESERVE:** source URLs, quoted excerpts, dates, provider metadata.
- **FORBIDDEN:** article outline, title optimization, prose draft, quality score.
- **OUTPUT:** `research-packet.v2` JSON plus optional rendered Markdown.
- **FAILURE:** `EVIDENCE_INSUFFICIENT` with missing coverage; never fill gaps.
- **BUDGET:** 12k–20k input characters; 2.5k–4k output tokens.
- **TELEMETRY:** source count, lineage count, counter-source count, invalid URL count,
  contradiction count.
- **KPI:** evidence audit pass rate; independent-lineage coverage; unsupported-source rate.

### 3.2 `insight-lock@2.0`

- **ROLE:** PLAN
- **GOAL:** Lock one defensible thesis, audience, article shape, and outline.
- **IMMUTABLE INPUTS:** validated Research Packet, topic, Domain Profile audience, assigned shape.
- **MUTABLE INPUTS:** candidate thesis/angle.
- **TASK:** test L0–L3; choose one thesis; define counter-position, objective, story flow, and
  preserve defaults.
- **PRESERVE:** evidence semantics and source IDs.
- **FORBIDDEN:** drafting article body, inventing new evidence, quality-scoring a nonexistent draft.
- **OUTPUT:** `insight-plan-lock.v2`.
- **FAILURE:** `INSIGHT_BELOW_L2` or `EVIDENCE_INSUFFICIENT`.
- **BUDGET:** 6k–10k input characters; 1.2k output tokens.
- **KPI:** plan completeness; thesis stability; human acceptance; downstream thesis mutation rate.

### 3.3 `draft-generation@2.0`

- **ROLE:** GENERATE
- **GOAL:** Produce Candidate v0 that follows locked Research and Plan.
- **IMMUTABLE INPUTS:** Research Packet, Thesis Lock, Outline Lock, source allowlist.
- **MUTABLE INPUTS:** article body within locked outline, optional chunk cursor.
- **TASK:** generate full candidate or deterministic chunk continuation.
- **PRESERVE:** source semantics, thesis, required outline IDs, writing preferences.
- **FORBIDDEN:** self-score, approve, add sources/claims outside packet, alter thesis.
- **OUTPUT:** complete Article candidate with stable section IDs and source/claim annotations.
- **FAILURE:** `OUTPUT_TRUNCATED` with continuation cursor; no partial candidate promotion.
- **BUDGET:** 12k–24k input characters; 6k–12k output tokens.
- **KPI:** draft contract completeness; first Editorial score; unsupported-new-claim rate.

### 3.4 `editorial-diagnosis@2.0`

- **ROLE:** DIAGNOSE
- **GOAL:** Score craft/structure/insight alignment and emit typed, located defects.
- **IMMUTABLE INPUTS:** Candidate revision, Thesis Lock, Outline Lock, diagnosis rubric.
- **MUTABLE INPUTS:** none.
- **TASK:** evaluate each rubric axis; locate defects; assign allowed mutation surface; produce
  provisional score.
- **PRESERVE:** candidate content; no generated replacements.
- **FORBIDDEN:** Article.md output, Fact verdict, repair instructions without defect IDs.
- **OUTPUT:** `editorial-diagnosis.v2` JSON.
- **MACHINE:** score components, total score, gate results, decision, defect array.
- **FAILURE:** `CONTEXT_INCOMPLETE`; malformed output is not converted from prose.
- **BUDGET:** full candidate at semantic section boundaries, maximum 32k characters; 1.5k–2.5k
  output tokens.
- **KPI:** machine-readable rate; inter-run decision stability; defect-location precision; human
  agreement.

### 3.5 `fact-audit@2.0`

- **ROLE:** AUDIT
- **GOAL:** Extract claims and map each to Research evidence.
- **IMMUTABLE INPUTS:** Candidate revision, Research Packet evidence records.
- **MUTABLE INPUTS:** none.
- **TASK:** enumerate factual/practice claims; bind evidence; classify
  Supported/Partial/Unsupported/Contradicted/Unverifiable.
- **PRESERVE:** narrative text and source records.
- **FORBIDDEN:** rewriting narrative, craft scoring, adding sources not in packet.
- **OUTPUT:** `claim-ledger.v2`.
- **FAILURE:** explicit unaudited claim IDs or `CONTEXT_INCOMPLETE`.
- **BUDGET:** candidate claim index + relevant sections up to 20k characters; evidence excerpts
  up to 12k; 2.5k–4k output tokens.
- **KPI:** claim coverage; verdict agreement; blocking-claim precision/recall; malformed rate.

### 3.6 `minor-remediation@2.0`

- **ROLE:** PATCH
- **GOAL:** Close listed local defects with the minimum edit surface.
- **IMMUTABLE INPUTS:** base candidate revision/hash, Thesis Lock, Outline Lock, preserve mask,
  defect IDs.
- **MUTABLE INPUTS:** only target sections/spans listed by defects.
- **TASK:** emit replace operations for exact defects.
- **PRESERVE:** title, thesis, outline/order, untargeted sections, source bindings.
- **FORBIDDEN:** global restyle, new claims, unlisted section changes, global score.
- **OUTPUT:** `article-patch.v1`.
- **FAILURE:** `TARGET_NOT_FOUND` or `PRESERVE_CONFLICT`; never emit a full draft fallback.
- **BUDGET:** 8k–16k input characters; 1k–3k output tokens.
- **KPI:** changed-surface ratio; defect closure; score delta; candidate regression; patch apply
  success.

### 3.7 `major-remediation@2.0`

- **ROLE:** PATCH
- **GOAL:** Repair a bounded set of related sections while preserving passed surfaces.
- **IMMUTABLE INPUTS:** base candidate, Thesis Lock unless explicitly mutable, preserve mask,
  typed defects, evidence refs.
- **MUTABLE INPUTS:** explicit section allowlist and ordering operations.
- **TASK:** emit ordered section replace/insert/move operations.
- **PRESERVE:** all passed sections and claim bindings outside allowlist.
- **FORBIDDEN:** full-article output, changing title/thesis without defect authorization, self-score.
- **OUTPUT:** `article-patch.v1`.
- **FAILURE:** `PRESERVE_CONFLICT` requesting controller escalation.
- **BUDGET:** 14k–24k input characters; 3k–6k output tokens.
- **KPI:** preserve-mask compliance; defects closed; new-defect rate; score delta.

### 3.8 `rewrite-remediation@2.0`

- **ROLE:** GENERATE
- **GOAL:** Produce a new candidate only after explicit rewrite authorization.
- **IMMUTABLE INPUTS:** Research Packet, controller-approved Thesis decision, passed-section
  preserve mask, source allowlist, open defects.
- **MUTABLE INPUTS:** sections marked rewriteable; thesis only for `THESIS_INVALID`.
- **TASK:** generate a complete candidate with preserve report.
- **PRESERVE:** passed sections/claims named by hashes.
- **FORBIDDEN:** ignoring preserve mask, adding sources, self-acceptance.
- **OUTPUT:** full candidate plus `preserveReport`.
- **FAILURE:** `PRESERVE_CONFLICT`; old best remains active.
- **BUDGET:** 16k–32k input characters; 8k–14k output tokens.
- **KPI:** preserve compliance; score delta; new-defect rate; rewrite-to-lock success.

### 3.9 `fact-remediation@2.0`

- **ROLE:** PATCH
- **GOAL:** Correct, hedge, or remove listed failing claims only.
- **IMMUTABLE INPUTS:** base candidate, Claim Ledger, Research evidence, unaffected claim IDs.
- **MUTABLE INPUTS:** spans containing target claim IDs.
- **TASK:** emit claim-local patch operations and claim disposition.
- **PRESERVE:** narrative outside target spans, thesis, structure, supported claims.
- **FORBIDDEN:** global rewrite, new unsupported claims, craft score.
- **OUTPUT:** `claim-patch.v1` compatible with patch apply engine.
- **FAILURE:** `EVIDENCE_INSUFFICIENT` with recommended delete/label action, not invented evidence.
- **BUDGET:** 6k–14k input characters; 1k–3k output tokens.
- **KPI:** blocking-claim reduction; touched-claim precision; new-claim count; re-audit pass rate.

### 3.10 `lock-verifier@2.0`

- **ROLE:** LOCK
- **GOAL:** Decide whether the frozen candidate is evidence-safe and action-complete.
- **IMMUTABLE INPUTS:** candidate revision/hash, Editorial Diagnosis result, Claim Ledger,
  open/closed defect log, controller regression summary.
- **MUTABLE INPUTS:** none.
- **TASK:** verify Fact lock, blocking claims, open actions, evidence lock, insight floor,
  unresolved blocking defects, and regression.
- **PRESERVE:** Editorial PASS craft surface; no broad craft re-score.
- **FORBIDDEN:** replacement prose, craft-only MINOR, new defect without typed evidence/location.
- **OUTPUT:** `lock-decision.v2`.
- **FAILURE:** `CONTEXT_INCOMPLETE`; never assume Fact PASS.
- **BUDGET:** 8k–16k input characters; 800–1.5k output tokens.
- **KPI:** false-MINOR rate; lock pass rate; escaped-blocking-defect rate; decision stability.

### 3.11 `human-review-support@2.0`

- **ROLE:** DIAGNOSE
- **GOAL:** Present a concise decision packet without taking the human decision.
- **IMMUTABLE INPUTS:** best candidate ref, current candidate ref, typed defects, comparison,
  recovery actions.
- **MUTABLE INPUTS:** none.
- **TASK:** summarize what changed, why progression stopped, and available choices.
- **PRESERVE:** machine defect IDs and scores exactly.
- **FORBIDDEN:** auto-accept, rewrite, hide regression, invent findings.
- **OUTPUT:** `human-review-packet.v1`.
- **FAILURE:** render machine fields directly if narrative summary fails.
- **BUDGET:** 4k–8k input characters; 500–900 output tokens.
- **KPI:** human decision completion; time-to-decision; reversal rate; clarity feedback.

## 4. Supporting prompt contracts

### `publish-renderer@2.0` — GENERATE

Transforms a locked candidate into reader-facing form. It may change presentation but not thesis,
claim semantics, source list, or Lock status. KPI: semantic-diff violation, publish quality,
unsupported-new-claim rate.

### `publish-polish@2.0` — PATCH

Applies a bounded list of release-surface polish defects. It outputs section patches, not a full
article by default. KPI: one-pass polish closure and changed-surface ratio.

### `publish-expansion@2.0` — PATCH

Adds content only to controller-selected sections using existing Research evidence. KPI: target
length attainment and new-claim rate.

### `publish-quality-repair@2.0` — PATCH

Consumes deterministic quality-gate codes and emits bounded repairs. Generic “make better”
instructions are forbidden.

### `human-polish@2.0` — PATCH

Human-edited text is immutable truth except explicitly marked grammar/flow spans. KPI: human-edit
preservation by hash.

### `reader-audit@2.0` — AUDIT

Reports reader friction with typed locations and optional polish actions. It never reopens
Editorial/Fact/Lock or triggers a full rewrite. KPI: actionable finding precision and no-global-
rewrite rate.

### `hero-brief@2.0` — GENERATE

Generates only the visual brief from locked title/thesis/article map. It cannot change article
content. KPI: article-specificity and human acceptance.

