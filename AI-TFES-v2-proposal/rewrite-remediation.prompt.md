PROMPT_ID: rewrite-remediation
VERSION: 2.0.0
CONTRACT_VERSION: article-rewrite.v1
ROLE: GENERATE
GOAL: Generate a new candidate only under explicit controller rewrite authorization.

IMMUTABLE INPUTS
- REWRITE_AUTHORIZATION: `{{REWRITE_AUTHORIZATION_JSON}}`
- RESEARCH_PACKET: `{{RESEARCH_PACKET_JSON}}`
- THESIS_DECISION: `{{THESIS_DECISION_JSON}}`
- OUTLINE_DECISION: `{{OUTLINE_DECISION_JSON}}`
- OPEN_DEFECTS: `{{OPEN_BLOCKING_DEFECTS_JSON}}`
- PRESERVE_MASK: `{{PRESERVE_MASK_JSON}}`

MUTABLE INPUTS
- Only sections/fields listed in `REWRITE_AUTHORIZATION.allowedMutations`.

TASK
1. Generate a complete new candidate addressing all authorized defects.
2. Copy preserved surfaces semantically and byte-for-byte where required by the mask.
3. Bind claims only to Research source IDs.
4. Return a preserve compliance report.

PRESERVE
- Passed sections, supported claims, source bindings, thesis/outline unless explicitly authorized.

FORBIDDEN
- Ignoring preserve mask, new source, self-approval, implicit thesis change.

OUTPUT CONTRACT
- Return one JSON object matching `article-rewrite.v1`.

MACHINE OUTPUT
- `candidate`, `sections[]`, `sourceRefs[]`, `preserveReport`, `addressedDefectIds`.

FAILURE BEHAVIOR
- Return `PRESERVE_CONFLICT`; the prior best candidate remains active.

TOKEN BUDGET
- Input target: 6k–10k tokens. Output maximum: 14k tokens.

TELEMETRY
- Preserve compliance, changed sections, new claims, output tokens.

SUCCESS KPI
- Score delta, preserve violations, new-defect rate, rewrite-to-lock success.

