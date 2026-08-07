# AI-TFES Context Map v2

**Status:** Proposal only  
**Unit:** Character limits are transport guidance; token limits are authoritative at runtime.

## 1. Context packing contract

Every call is assembled in this order:

1. Prompt contract and machine schema.
2. Current action/defect envelope.
3. Immutable references and integrity hashes.
4. Mutable target content.
5. Minimal supporting evidence.
6. Optional style/domain hints.

The model never receives raw database history, unrelated old reviews, full prompts from previous
calls, secrets, deployment config, or hidden controller policy.

## 2. Artifact and mutability map

| Context artifact | Scope | Integrity | Consumers | Mutation |
|---|---|---|---|---|
| Research Packet | workflow run | revision + source IDs | Plan, Generate, Fact, selected patches | Explicit research refresh only |
| Thesis Lock | workflow run/cycle | hash | Generate, Diagnose, patches, Lock | Controller + typed thesis defect |
| Outline Lock | workflow run/cycle | ordered section IDs + hash | Generate, patches | Explicit MAJOR/REWRITE operation |
| Candidate | revision | immutable revision + section hashes | Diagnose, Fact, Lock, patches | Never in place |
| Best Candidate | remediation cycle | candidate reference | Controller, Human support | Promote reference only |
| Defect Log | cycle | append-only IDs | Patches, Lock, Human support | Close/reopen state only |
| Claim Ledger | candidate revision | ledger revision + claim hashes | Fact patch, Lock | New revision after invalidation |
| Preserve Mask | patch attempt | section/claim hashes | Patch/rewrite prompts | Controller-generated |
| Human Decision | cycle | immutable audit event | Controller, next action | Never |
| Domain Style Slice | phase | registry version | Generate/polish only | Registry selection |

## 3. Semantic clipping rules

1. Clip Research by complete source/evidence records, preserving source ID, URL, excerpt, and
   limitations together.
2. Clip candidates by complete section IDs. Never cut inside a Markdown code block, table row,
   claim anchor, or reference entry.
3. A PATCH prompt receives target sections and at most one neighboring section on either side.
4. Fact context is selected by claim IDs and evidence refs, not by first-N characters.
5. Lock context uses summaries and typed IDs; full candidate is optional only for insight-floor
   verification or disputed residual location.
6. If a required record cannot fit, return `CONTEXT_INCOMPLETE` with missing IDs.
7. Optional style guidance is dropped before any required evidence or target content.

## 4. Per-prompt context map

### `research-packet@2.0`

- **Required:** topic; resolved source-tier/freshness policy; normalized search records; access
  dates; editorial-memory duplicate signatures.
- **Optional:** prior failed Insight test (maximum one latest event); known correction/retraction
  notices for the same topic.
- **Forbidden:** draft, Review, Fact Ledger, Final output, full workflow history.
- **Order:** research contract → source policy → retry reason → search records → dedupe hints.
- **Clipping:** complete search records; favor primary/counter/independent lineages; maximum
  20k characters before explicit `EVIDENCE_INSUFFICIENT`.
- **Budget:** 4k–6k input tokens; 2.5k–4k output tokens.

### `insight-lock@2.0`

- **Required:** Research summary, contradictions, limitations, candidate insights, topic,
  audience, shape candidates.
- **Optional:** editorial-memory duplicate signatures; writing preferences affecting format.
- **Forbidden:** article draft, prior quality scores, Fact/Final history.
- **Order:** contract → research limitations → contradiction set → findings → audience/shape.
- **Clipping:** preserve all limitations and contradiction records; clip low-priority context
  findings first.
- **Budget:** 2k–3k input tokens; 800–1.2k output tokens.

### `draft-generation@2.0`

- **Required:** Thesis Lock; Outline Lock; Research evidence index; source allowlist; writing
  preferences; Domain Style Slice; article shape.
- **Optional:** selected gold-sample traits represented as style features—not full sample text.
- **Forbidden:** Editorial/Final scores, old rejected drafts, defect history.
- **Order:** contract → thesis/outline → source constraints → writing/shape → evidence records.
- **Clipping:** keep thesis/outline complete; include evidence records referenced by planned
  sections; use continuation cursor instead of truncating output.
- **Budget:** 4k–7k input tokens; 6k–12k output tokens.

### `editorial-diagnosis@2.0`

- **Required:** complete Candidate sections; Thesis/Outline Locks; Editorial rubric; shape
  requirements.
- **Optional:** Research source IDs for checking whether a statement is grounded, but no verdict
  assignment.
- **Forbidden:** prior diagnosis score/decision during blind scoring; Fact verdict; Final
  decision; remediation prompt.
- **Order:** contract/schema → rubric → thesis/outline → candidate.
- **Clipping:** candidate must be complete up to 32k characters; otherwise section-batch
  diagnosis with deterministic aggregation, never prefix-only judgment.
- **Budget:** 5k–9k input tokens; 1.5k–2.5k output tokens.

### `fact-audit@2.0`

- **Required:** candidate claim index and containing sections; complete relevant Research evidence
  records; source policy.
- **Optional:** Editorial defects of type CLAIM/EVIDENCE_BINDING only.
- **Forbidden:** craft defects, prose rewrite instructions, Final score, rejected candidates.
- **Order:** contract/schema → source policy → claim index → candidate spans → evidence records.
- **Clipping:** group calls by claim batch when necessary; every claim records audit coverage.
- **Budget:** 5k–8k input tokens per batch; 2.5k–4k output tokens.

### `minor-remediation@2.0`

- **Required:** base revision/hash; typed MINOR defects; allowed mutations; preserve mask; target
  sections; local neighbors; exact evidence excerpts for affected claims.
- **Optional:** Domain Style Slice limited to affected craft rule.
- **Forbidden:** full Research Packet, full old Review prose, Fact Ledger unrelated claims, Final
  history, untargeted sections, rejected drafts.
- **Order:** patch schema → defects → preserve mask → targets/neighbors → evidence.
- **Clipping:** never clip defect or preserve records; cap target bundle at 12k characters and
  split by non-overlapping defect groups.
- **Budget:** 2.5k–4.5k input tokens; 1k–3k output tokens.

### `major-remediation@2.0`

- **Required:** base candidate section map; typed defects; explicit section allowlist; preserve
  mask; Thesis Lock; evidence for affected claims.
- **Optional:** full target sections and one neighbor each.
- **Forbidden:** unrelated Research prose, old scores, complete workflow history.
- **Order:** schema → defects/dependencies → preserve/allowlist → target sections → evidence.
- **Clipping:** split into ordered patch sets if allowed sections exceed 24k characters.
- **Budget:** 4k–7k input tokens; 3k–6k output tokens.

### `rewrite-remediation@2.0`

- **Required:** controller rewrite authorization; open blocking defects; Research Packet;
  Thesis decision; Outline decision; passed-section/claim preserve mask; best-candidate section
  map.
- **Optional:** content of passed sections only when needed for transitions; otherwise hashes.
- **Forbidden:** old rejected candidates other than defect summaries; implicit permission to
  change preserved surfaces.
- **Order:** authorization → defects → preserve mask → plan → evidence → mutable content.
- **Clipping:** no arbitrary clipping; if complete rewrite contract cannot fit, fail before call.
- **Budget:** 6k–10k input tokens; 8k–14k output tokens.

### `fact-remediation@2.0`

- **Required:** target claim IDs; verdict/action; containing spans; exact evidence excerpts;
  preserve claim IDs.
- **Optional:** one neighboring paragraph for grammatical integration.
- **Forbidden:** full Editorial Review, craft score, unrelated sections/claims, source discovery.
- **Order:** patch schema → claim actions → preserve list → spans → evidence.
- **Clipping:** batch independent claims; each emitted operation binds one or more claim IDs.
- **Budget:** 2k–4k input tokens; 1k–3k output tokens.

### `lock-verifier@2.0`

- **Required:** candidate revision/hash; Editorial PASS summary and unresolved blocking defect IDs;
  Fact Ledger status; blocking claim IDs; open required actions; Thesis Lock; controller
  regression summary.
- **Optional:** patch diff summary; only candidate sections referenced by unresolved items or
  needed for insight-floor verification.
- **Forbidden:** broad writing rubric, full Research Packet, old Review prose, repair prompt,
  unrelated history.
- **Order:** lock schema → blocking/open IDs → Fact summary → Editorial summary → regression →
  selected spans.
- **Clipping:** typed summaries are never clipped; selected spans capped at 8k characters.
- **Budget:** 2k–4k input tokens; 800–1.5k output tokens.

### `human-review-support@2.0`

- **Required:** best/current candidate refs; score delta; rejected/preserved status; open defect
  IDs; available actions and consequences.
- **Optional:** short localized excerpts for each defect.
- **Forbidden:** full prompts, hidden chain-of-thought, unrelated article history, recommendation
  framed as automatic decision.
- **Order:** decision options → comparison → defects → excerpts.
- **Clipping:** maximum three highest-priority defects inline; remaining IDs summarized by count.
- **Budget:** 1k–2k input tokens; 500–900 output tokens.

## 5. Supporting publish context

| Prompt | Required | Optional | Forbidden |
|---|---|---|---|
| publish-renderer | locked candidate, thesis, source refs, reader format | style slice, writing prefs | old defects, rejected candidates, unlocked evidence |
| publish-polish | current package, typed polish defects, preserve hashes | Reader Audit locations | Research dump, global rewrite instruction |
| publish-expansion | target sections, target length, evidence refs | one neighbor/section | new sources, arbitrary sections |
| publish-quality-repair | deterministic gate codes, target spans | style rule for exact code | generic “improve quality” |
| human-polish | human-edited package, allowed grammar spans | editor notes | prior AI draft as authority |
| reader-audit | reader-facing package, audience roles | thesis summary | Research/Fact history, rewrite permission |
| hero-brief | locked title, thesis, article map | visual preferences | Review/Fact/history |

## 6. Current-to-v2 size comparison

### Current revision remediation

Current assembly can contain:

- failure reason: 700 characters;
- Final Required Revisions: 3k;
- support/prior review;
- Research: 4k;
- Insight/Plan: 2k;
- full draft: 16k–32k;
- Fact: 5k;
- shape/template/system instructions.

Estimated input: **35k–52k characters**, approximately **9k–14k tokens**, before provider-specific
tokenization. It still outputs a complete draft.

### v2 MINOR remediation

- machine contract/defects: 1.5k–3k characters;
- preserve mask: 1k–2k;
- targets + neighbors: 4k–8k;
- evidence excerpts: 2k–4k;
- compact role/style policy: 1k–2k.

Estimated input: **9.5k–19k characters**, approximately **2.5k–5k tokens**.

Estimated reduction: **55–75% input tokens per MINOR remediation**. Output reduction can be
larger because section patches replace a full 8k–14k-token draft. This is a design estimate and
must be measured.

### Current Final vs v2 Lock

Current Final can receive 3k Review + 4k Fact + 16k–32k draft + templates/system, estimated
**28k–45k characters**.

v2 Lock receives typed summaries, open IDs, regression summary, and selected spans, estimated
**7k–16k characters**.

Estimated reduction: **50–75% input tokens per Lock call**.

### Article-level estimate

- First-pass articles: likely **5–15%** token reduction from registry/template deduplication.
- Articles with MINOR remediation: likely **30–60%** total article token reduction.
- MAJOR/REWRITE-heavy articles: uncertain; preserve-mask calls may add verifier overhead.

All percentages are hypotheses until telemetry records actual input/output tokens per prompt ID.

