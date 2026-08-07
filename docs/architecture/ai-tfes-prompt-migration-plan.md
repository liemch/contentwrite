# AI-TFES Prompt Architecture v2 — Migration Plan

**Status:** First prompt trio implemented behind default-OFF switch; remaining migration is design only
**Invariant:** v1.6 remains addressable and unchanged throughout migration.

## 1. Inventory method

The inventory traces task prompt builders in `web/src/lib/tfes/prompts.ts` to actual callers in
`web/src/lib/tfes/workflow.ts` and helper calls used by clean-publish repair. “Active” means a
runtime caller exists. System prompt envelopes and templates are inventoried separately because
they are reused across task prompts.

Runtime reads the synced `web/content/ai-tfes/` tree, with configured TFES document overrides able
to take precedence. The source `AI-TFES/` tree and documentation-only templates are not counted as
additional runtime prompts unless a caller loads them.

Context sizes below are maximum characters explicitly assembled by current code where available;
shared prompt/template/domain text is additional. Dynamic output budgets use
`cleanGenMaxTokens`, currently bounded to 8,000–16,384.

## 2. Active task prompt inventory

| Current prompt ID | Phase / caller | Main inputs and current context | Output / machine contract | maxTokens | Responsibility flags | Overlap | Disposition |
|---|---|---|---|---:|---|---|---|
| `Daily-Task` | Research synthesis; `workflow.ts` research call | domain, topic, Editorial Memory ≤2.5k | Filled daily-task prose; no dedicated runtime parser | Shares 3,500-call budget | plan hint: yes; generate/judge/remediate: no | Research prompt and Decision | **MERGE** into Research request envelope |
| `buildResearchPrompt` | Verification + Synthesis; research call | search ≤10k, previous gate fail ≤2.5k, Research template | Research Brief Markdown; deterministic evidence audit, not fully typed LLM output | 3,500 | research/generate artifact | Daily Task, Insight | **MERGE** as `research-packet` |
| `insight-a` | Insight Gate; `workflow.ts` | Research ≤5k, topic | L0–L3 + tests + conclusion; regex gate parser | 1,200 | judge: yes | Decision/Planning and Editorial insight score | **REDESIGN** as typed part of `insight-lock` |
| `insight-decision` | Editorial Decision | Gate ≤1.2k, Research ≤1.2k, topic, shape | Required prose bullets; regex completeness | 700 | plan/judge | Insight Gate and Planning | **MERGE** into `insight-lock` |
| `insight-planning` | Planning | prior insight/decision ≤1.8k, Research ≤2k, topic, shape | Checklist; regex completeness | 1,400 | plan | Decision and Draft instructions | **MERGE** into `insight-lock` |
| `write-a` | Draft first half | Research ≤3.5k, Insight/Plan ≤2k, topic, prefs, shape, Article template | Partial Article.md; deterministic phase quality checks | 3,500 | generate: yes | Write-B; duplicates full writing rules | **MERGE** into one logical `draft-generation` contract |
| `write-b` | Draft second half | Plan ≤1.5k, part A ≤5k, topic, prefs, shape, Article template | Partial Article.md merged by runtime; deterministic full-draft checks | 3,500 | generate: yes | Write-A | **MERGE** into one logical `draft-generation` contract |
| `finalize-review` | Editorial Review | Research ≤3k, Insight ≤1.2k, draft 16k–32k, topic, shape, Review template | Narrative Review + 4 machine lines | 2,200 | judge/diagnose: yes | Final Verification shares G1–G8 and rubric | **REDESIGN** as typed `editorial-diagnosis` |
| `finalize-revision-remediate` | Revision remediation | failure ≤700, Final feedback ≤3k, prior support, Research ≤4k, Insight ≤2k, draft 16k–32k, Fact ≤5k | Full Article.md; optional RC1 preserve metadata | dynamic 8k–16,384 | generate + remediate; interprets diagnosis | MINOR/MAJOR/REWRITE combined; overlaps Fact remediation | **SPLIT** into MINOR, MAJOR, REWRITE contracts |
| `finalize-fact-remediate` | Fact remediation | Research ≤3.5k, draft ≤12k, Fact ≤6k, topic | Full Article.md; no typed patch contract | dynamic 8k–16,384 | generate + remediate | Revision remediation | **REDESIGN** as claim-local `fact-remediation` |
| `finalize-a` | Fact Check | Research ≤2.5k, Insight ≤1k, draft ≤6k, selected prior support, topic, Fact template | FactCheck.md + status line; parsed ledger summary | 2,500 | audit/judge: yes | Editorial evidence and Final evidence lock | **REDESIGN** as typed `fact-audit` |
| `finalize-verify` | Final Verification | Editorial Review ≤3k, Fact ≤4k, draft 16k–32k, topic, retry hint, Review template | Narrative Review + 5 machine lines | 2,200 | judge/lock; also proposes required revisions | Editorial re-scores same craft surface | **REDESIGN** as `lock-verifier` |
| `finalize-b` | Publish package | Insight ≤1k, draft ≤12k, Review/Fact support, topic, prefs, shape, Publish template | Knowledge Record + clean article + Hero marker; parser extracts clean package | dynamic 8k–16,384 | generate: yes | Polish rewrites same reader surface | **REDESIGN** as `publish-renderer` |
| `finalize-polish` | Clean publish polish | clean ≤18k, Research ≤2k, Review/Fact/Reader support, topic, prefs, shape | Full clean article; deterministic fallback/quality checks | dynamic 8k–16,384 | remediate + generate full article | Publish renderer, repair, reader audit | **REDESIGN** as bounded `publish-polish` |
| `finalize-human-polish` | Manual edit recovery/polish | human-edited clean article, editor notes, prefs, shape | Full clean article | dynamic | remediate: yes | Publish polish | **REDESIGN** with human text immutable by default |
| `finalize-expand` | Short clean article helper | current clean article, Research, topic, prefs, shape | Full expanded clean article | dynamic 8k–16,384 | remediate + generate | Repair and polish | **REDESIGN** as section-targeted expansion patch |
| `finalize-repair` | Clean quality gate helper | quality hint, clean article, Research/Fact as helper supplies | Full clean article | dynamic 8k–16,384 | diagnose interpretation + remediate | Polish/expand; generic repair surface | **REDESIGN** as typed gate-code repair |
| `finalize-hero` | Hero brief | selected visual context, title, topic | Fixed Hero Brief block; parser best-effort | 500 | generate: yes | Minimal | **KEEP** role; version/contract hardening only |
| `finalize-reader-sim` | Reader Simulation | domain roles, clean body ≤5.5k, title, topic, shape | Reader reactions + conclusion line | 900 | judge/audit: yes | Editorial craft and polish feedback | **REDESIGN** as non-global `reader-audit` |

Active disposition count:

- **KEEP:** 1
- **REDESIGN:** 11
- **MERGE:** 6
- **SPLIT:** 1
- **RETIRE:** 0 active prompts

These categories are mutually exclusive by current prompt ID, not by future prompt count.

## 3. Cross-cutting system prompt inventory

| Current ID | Runtime use | Input / contract | Overlap | Disposition |
|---|---|---|---|---|
| `getSystemPrompt` | Heavy generation, publish, polish, expand/repair, Hero, Reader Simulation, human polish | Full Operating Prompt + resolved Domain Profile + Engineering gold bar; no output contract of its own | Repeats workflow, quality, style, and phase rules already present in task prompts | **REDESIGN** into versioned role-policy slices |
| `getSystemPromptLite` | Insight, Editorial, Fact, remediation, Final, seed/image helpers | Editor identity + first 3k characters of Domain Profile; no output contract of its own | Duplicates broad prohibitions and gives different domain-policy density from full wrapper | **REDESIGN** into compact role envelope |

System wrappers are LLM-facing components but not task prompts, so they are not included in the
19-task core count.

## 4. TFES-adjacent auxiliary runtime prompt inventory

| Current prompt ID | Caller / inputs | Output contract / maxTokens | Disposition |
|---|---|---|---|
| `suggest-seed-topics` | `suggestTrendSeedTopics`; search records + up to 40 existing seed exclusions; Lite system | 20–30 lines, parser requires ≥8 valid topics; 1,200 | **KEEP** role; add registry/schema version |
| `suggest-image-briefs` | `suggestImageBriefs` pass 1; thesis ≤900, article visual map, prior Hero ≤800 | JSON image slots; 1,800 | **MERGE** into one visual-brief prompt family with `hero-brief` |
| `suggest-image-briefs-critique` | `suggestImageBriefs` pass 2; article map + generated candidates | Same JSON slots; 1,800 | **KEEP** as separate AUDIT role inside visual module |
| `weekly-digest` | `generateWeeklyDigest`; source list + article excerpts ≤3.5k; custom system prompt | Markdown title/body with minimum-length check; 1,800 | **KEEP**; orthogonal to article convergence |

The Tavily Research web-search phase is deterministic retrieval and is not counted as an LLM
prompt.

Broad active inventory:

- **19** core task prompts;
- **2** system wrappers;
- **4** auxiliary runtime prompts;
- **25 active LLM-facing identities/components total**.

Broad active disposition count:

- **KEEP:** 4
- **REDESIGN:** 13
- **MERGE:** 7
- **SPLIT:** 1
- **RETIRE:** 0 active identities

## 5. Defined but inactive legacy task prompts

| Prompt ID | Definition | Current caller | Disposition |
|---|---|---|---|
| `insight` | Full legacy Gate + Decision + Planning | none found | **RETIRE** |
| `insight-b` | Legacy Decision + Planning | none found | **RETIRE** |
| `write` | Legacy full Article writing | none found | **RETIRE** |
| `finalize` | Legacy combined Review + Fact + Publish | none found | **RETIRE** |

Legacy count: **4 RETIRE**, after an import/runtime assertion confirms no external caller.

## 6. Cross-cutting prompt layers and templates

| Asset | Current use | Conflict | v2 action |
|---|---|---|---|
| `getSystemPrompt` / Operating-Prompt.md | Full generation phases | Restates entire pipeline, writing bar, review/fact policy, and output rules on calls that need one task | Split into compact immutable policy modules by role |
| `getSystemPromptLite` | Plan, Review, Fact, remediation, Final | Includes clipped Domain Profile and broad prohibitions; task prompts repeat constraints | Replace with role envelope + phase-specific domain slice |
| Domain Profiles | Most calls | Full/clipped profile may include irrelevant seed/scoring/style sections | Select typed slices: source policy, audience, style, sensitivity |
| `Article.md` | Draft and both remediation prompts | Full template included even for local remediation | Draft only; patch prompts receive section schema |
| `Review.md` | Editorial and Final | Same prose rubric/template across provisional diagnosis and lock | Split `editorial-diagnosis.v2` and `lock-decision.v2` schemas |
| `FactCheck.md` | Fact Audit | Markdown table plus separate status line | Typed `claim-ledger.v2`, optional Markdown renderer |
| `Publish.md` | Publish renderer | Includes checklist, metadata, content, image, SEO responsibilities | Split publish content contract from deterministic package metadata |

Templates are output schemas/renderers, not independent task prompts.

## 7. Conflict analysis

### Highest regression risk

`finalize-revision-remediate` is highest risk because it:

- consumes diagnosis, research, insight, draft, optional Fact, and shape simultaneously;
- interprets three severities;
- outputs a full replacement draft for every severity;
- can change surfaces that already passed;
- does not itself verify preserve compliance;
- precedes a second global Editorial score.

Production’s 85→63→56 trajectory occurs directly after this path.

### Other material conflicts

1. Editorial and Final both judge G1–G8/craft but use different bars.
2. Fact remediation is claim-scoped in instruction but full-draft in representation.
3. Publish render, polish, repair, and expansion each return complete reader-facing articles.
4. Narrative contracts plus trailing machine lines permit internal disagreement and parser repair.
5. Research/Decision/Planning repeat context and responsibilities across sequential calls.
6. System envelopes carry rules irrelevant to many phases, increasing instruction competition.

## 8. Prompt registry migration foundation

Implementation status for WP-PV2-01:

- minimal registry and v1.6 fallback: implemented;
- additive prompt/version/context telemetry: implemented;
- `editorial-diagnosis@2.0`: implemented behind switch;
- `minor-remediation@2.0`: implemented as `full-draft-preserve`, not Section Patch;
- `lock-verifier@2.0`: implemented behind switch;
- production cohort: pending.

Before switching behavior:

1. Define a registry that can resolve v1.6 and v2 simultaneously.
2. Persist `promptId`, `promptVersion`, `contractVersion`, template checksum, model, token usage,
   cohort, and fallback version per call.
3. Validate input/output schemas outside prompts.
4. Add a static import boundary: production cannot import `AI-TFES-v2-proposal/`.
5. Keep state transition decisions in deterministic workflow/controller code.
6. Add per-prompt kill switch and automatic fallback only before any artifact is promoted.

No schema migration is required for the design; future implementation may use existing transition
details/artifact metadata initially.

## 9. Migration order

### Stage 0 — Registry and offline contracts

- **Implemented:** registry abstraction and machine-contract fixtures.
- Do not change selected v1.6 versions.
- Record actual input/output tokens to replace character-based estimates.
- Gate: identical v1.6 behavior and telemetry completeness.

### Stage 1 — Editorial Diagnosis shadow

- **Implemented behind switch; cohort pending.** Current minimal runtime selects v1.6 or v2 for
  the workflow call; a separate asynchronous shadow-call platform was intentionally not added.
- Do not route workflow from its decision.
- Compare decision stability, score, defect location, and human agreement with v1.6.
- Gate: ≥99% machine-readable; no systematic blind spot; stable defect IDs/locations.

### Stage 2 — MINOR Patch A/B

- **Prompt implemented behind switch; Section Patch Engine remains deferred.** The compatibility
  runtime returns a full draft with minimum-edit/preserve semantics and records
  `remediationMedium=full-draft-preserve`.
- Keep v1.6 full rewrite as control and rollback.
- Candidate Lock remains authoritative.
- Gate: higher defect closure and monotonicity; lower regression; no quality/human correction
  increase beyond agreed bounds.

### Stage 3 — Lock Verifier A/B

- **Implemented behind switch; A/B cohort pending.** Uses typed Editorial output, deterministic
  Fact summary/blockers, and existing state mappings.
- Compare v1.6 Final with `lock-verifier@2.0` on false-MINOR, lock agreement, and escaped blocking
  issues.
- Gate: false-MINOR decreases without increased human corrections.

### Stage 4 — Fact Audit and Fact Patch

- Shadow `fact-audit@2.0`; calibrate claim coverage/verdict agreement.
- Canary `fact-remediation@2.0` on claim-local failures.
- Continue full Fact re-audit until partial invalidation is separately validated.

### Stage 5 — MAJOR and Rewrite

- Introduce multi-section patches, then controller-authorized rewrite.
- Require preserve hash validation.
- Never fall back from failed patch to silent full rewrite in the same attempt.

### Stage 6 — Upstream consolidation

- Merge Research request layers into `research-packet@2.0`.
- Merge Gate/Decision/Planning into `insight-lock@2.0`.
- Merge Write-A/B as one logical contract while retaining chunk transport if needed.

### Stage 7 — Publish surface

- Version `publish-renderer`, bounded polish/repair/expand, reader audit, human polish, and Hero.
- Publishing changes cannot reopen Editorial/Fact/Lock without a semantic-diff violation.

## 10. A/B requirements

Must A/B before production-wide activation:

- MINOR patch vs full rewrite.
- MAJOR patch.
- Rewrite preserve-mask.
- Lock Verifier vs current Final.
- Fact remediation patch.
- Research Packet behavior change.
- Insight Lock consolidation.
- Publish renderer/polish semantic preservation.
- Any Domain Style Slice replacing the full profile.

Can run shadow first without workflow effect:

- Editorial Diagnosis.
- Fact Audit.
- Lock Verifier.
- Reader Audit.
- Research Packet.

Low-risk candidates for direct versioned replacement after contract fixtures:

- Hero Brief (role unchanged).
- Human Review Support (new non-decision artifact).

No core convergence prompt should be switched globally without cohort evidence.

## 11. Rollback model

Each registry entry defines:

- selected version;
- control version;
- cohort percentage;
- fallback eligibility;
- artifact compatibility;
- kill switch.

Rollback rules:

1. Stop assigning new runs to v2.
2. Existing run uses the version pinned at cycle start.
3. Never parse v2 output using a v1.6 parser or vice versa.
4. Never overwrite best candidate during rollback.
5. If a v2 patch cannot apply, preserve the candidate and route to human/control on a new attempt.
6. Keep all telemetry for comparison.

## 12. Evaluation gates

| Gate | Required evidence |
|---|---|
| Contract | machine-readable rate, schema validity, no invented runtime IDs |
| Safety | preserve violations = 0 accepted; unsupported-new-claim rate non-increasing |
| Convergence | score monotonicity and defect closure improve |
| Reliability | no increased parser/timeout/exhaustion beyond agreed bound |
| Product | human correction and recovery do not materially increase |
| Cost | tokens and latency per completed article measured, not per call only |

Every rate must state numerator, denominator, cohort, prompt version, model, and time window.

## 13. Estimated context/token impact

Design estimates:

- MINOR remediation input: **55–75% lower**; output substantially lower due to patch-only output.
- Lock input: **50–75% lower** by replacing full global re-review context with typed summaries and
  selected spans.
- First-pass article: **5–15% lower** through policy/template deduplication.
- Remediated article total: **30–60% lower** when local patch succeeds.

These are hypotheses derived from current character caps, not measured token telemetry. Stage 0
must replace them with provider token counts.

## 14. Recommended first three migrations

1. `editorial-diagnosis@2.0` in shadow, then active diagnosis.
2. `minor-remediation@2.0` behind Candidate Lock and A/B cohort.
3. `lock-verifier@2.0` in shadow, then A/B lock mode.

This order creates typed defects, changes the destructive update rule, and removes the second
global craft judge—the three prompt-level changes most directly tied to production convergence.

