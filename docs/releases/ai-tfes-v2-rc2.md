# AI-TFES v2 RC2 — Full Prompt Architecture

**Release candidate:** RC1 controls + full Prompt Architecture set
**Default on `optimize/process` (Preview):** all RC2 prompts ON → `v2-rc2`

## Prompt set (all `@2.0` when `promptArchitecture.enabled`)

| Prompt ID | Step | Contract | Output compatibility |
|-----------|------|----------|----------------------|
| `research-packet` | Research Verify+Synth | `research-packet.v2` | JSON + Research Brief markdown (evidence audit) |
| `insight-lock` | Insight Gate+Decision+Planning (consolidate) | `insight-plan-lock.v2` | Typed JSON → labelled markdown |
| `draft-generation` | Write A/B | `article-candidate.v2` | Markdown Article.md halves |
| `editorial-diagnosis` | Editorial Review | `editorial-diagnosis.v2` | Marked JSON (+ gate defect synthesize) |
| `minor/major-remediation` | Revision | `article-patch.v1` | Section patch apply (+ full-draft fallback) |
| `rewrite-remediation` | Rewrite | `full-draft-rewrite.v2` | Full Article.md |
| `fact-audit` | Fact Check | `claim-ledger.v2` | JSON → markdown ledger (CENTRAL-first) |
| `fact-remediation` | Fact repair | `claim-patch.v1` | Claim/section patch apply |
| `lock-verifier` | Final 9b | `lock-decision.v2` | Marked JSON (+ format repair) |
| `publish-renderer` | Publish clean build | `publish-renderer.v2` | Existing clean marker + Markdown |
| `publish-polish` | Polish | `publish-polish.v2` / `article-patch.v1` | Patch preferred |
| `publish-expansion` | Length recovery | `publish-expansion.v2` / `article-patch.v1` | Patch preferred |
| `publish-quality-repair` | Quality-gate recovery | `publish-quality-repair.v2` / `article-patch.v1` | Patch preferred |
| `hero-brief` | Hero brief | `hero-brief.v2` | Existing Hero Brief labels |
| `reader-audit` | Reader Sim | `reader-audit.v2` | Typed JSON → `KẾT LUẬN` markdown |
| `human-polish` | Human Edit Loop | `human-polish.v2` | Full clean Markdown |

`insight-gate` / `editorial-decision` remain available as v1.6/v2 fallbacks when `insightConsolidate.enabled=false`.

Publish package assembly and state transitions are deterministic runtime operations, not LLM prompts.

## Section Patch + quality waves

```text
PIPELINE_CONFIG.aiTfesV2.sectionPatch.enabled = true
PIPELINE_CONFIG.aiTfesV2.insightConsolidate.enabled = true
```

- MINOR/MAJOR rem, publish polish/repair/expand, and fact rem prefer `ARTICLE_PATCH_JSON` /
  `CLAIM_PATCH_JSON` apply via `section-patch.ts` (full-draft fallback on apply failure).
- Insight Gate+Decision+Planning collapse into `insight-lock@2.0` when consolidate is ON.
- Research/Fact are JSON-first; Markdown is materialized for legacy auditors.
- Reader Audit emits typed findings that feed polish targets (no extra smooth step).

## Configuration

```text
PIPELINE_CONFIG.aiTfesV2.promptArchitecture.enabled = true
# every prompt version field is "2.0", from researchPacket through
# readerAudit and humanPolish
```

Rollback: `promptArchitecture.enabled = false` → all builders fall back to v1.6.
Also: `sectionPatch.enabled = false` → full-draft parse; `insightConsolidate.enabled = false` → separate gate/decision ticks.

## Not yet (proposal-only)

- Multi-agent routing, schema migration, score-floor change
- Patch-only polish without full-draft fallback in production cohorts

## Preview checks

1. Research Brief still passes evidence audit (URLs, Tier, Accessed, counter-perspective)
2. Fact ledger still parses + VERIFICATION_STATUS works after CLAIM_LEDGER_JSON render
3. Write A/B still produce full draft quality marks
4. Minor rem / polish emit patch when possible; fallback keeps pipeline alive
5. Editorial → rem → Fact → Lock path green on ≥3 smoke articles
6. Reader FAIL → polish receives concrete targets; no dedicated smooth step
