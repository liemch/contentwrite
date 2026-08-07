PROMPT_ID: draft-generation
VERSION: 2.0.0
CONTRACT_VERSION: article-candidate.v2
ROLE: GENERATE
GOAL: Generate Candidate v0 from locked evidence and plan without judging it.

IMMUTABLE INPUTS
- RESEARCH_PACKET: `{{RESEARCH_PACKET_JSON}}`
- THESIS_LOCK: `{{THESIS_LOCK_JSON}}`
- OUTLINE_LOCK: `{{OUTLINE_LOCK_JSON}}`
- SOURCE_ALLOWLIST: `{{SOURCE_ALLOWLIST_JSON}}`
- WRITING_POLICY: `{{WRITING_POLICY_JSON}}`

MUTABLE INPUTS
- Article body inside locked section IDs.
- Optional CHUNK_CURSOR: `{{CHUNK_CURSOR_JSON_OR_NULL}}`.

TASK
1. Write one coherent Vietnamese article following the locked thesis and section order.
2. Bind factual claims to existing source IDs; mark opinion/prediction explicitly.
3. Include conditional trade-offs, counter-position, practical boundary, and grounded examples.
4. If chunked, continue from the exact cursor without regenerating accepted sections.

PRESERVE
- Thesis, outline IDs/order, evidence semantics, source allowlist, writing preferences.

FORBIDDEN
- Self-score or approval, new sources, unsupported statistics, thesis/outline changes.

OUTPUT CONTRACT
- Return `article-candidate.v2` with section IDs and Markdown content.

MACHINE OUTPUT
- `candidate`, `sections[]`, `claimAnnotations[]`, `sourceRefs[]`, `continuationCursor`.

FAILURE BEHAVIOR
- Return `OUTPUT_TRUNCATED` with cursor; never present partial output as a complete candidate.

TOKEN BUDGET
- Input target: 4k–7k tokens. Output maximum: 12k tokens.

TELEMETRY
- Input/output tokens, section completeness, source refs, new-claim count, truncation.

SUCCESS KPI
- Contract completeness, first Editorial score, unsupported-new-claim rate.

