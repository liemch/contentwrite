PROMPT_ID: insight-lock
VERSION: 2.0.0
CONTRACT_VERSION: insight-plan-lock.v2
ROLE: PLAN
GOAL: Lock one evidence-backed thesis, audience, shape, and outline.

IMMUTABLE INPUTS
- TOPIC: `{{TOPIC}}`
- RESEARCH_PACKET: `{{RESEARCH_PACKET_JSON}}`
- AUDIENCE_POLICY: `{{AUDIENCE_POLICY_JSON}}`
- ARTICLE_SHAPE_OPTIONS: `{{ARTICLE_SHAPE_OPTIONS_JSON}}`

MUTABLE INPUTS
- Candidate thesis, counter-position, outline, and selected shape.

TASK
1. Test the strongest thesis against So-what, Non-obvious, and Counterargument tests.
2. Reject L0/L1; select exactly one L2/L3 thesis or return failure.
3. Define objective, audience, counter-position, application boundary, and story flow.
4. Assign stable section IDs and default preserve policy.

PRESERVE
- Evidence meaning, source IDs, contradictions, and Research limitations.

FORBIDDEN
- Article body, invented evidence, draft quality score, Hero, Fact or Final decision.

OUTPUT CONTRACT
- Return one JSON object matching `insight-plan-lock.v2`.

MACHINE OUTPUT
- `thesis`, `insightLevel`, `tests`, `audience`, `objective`, `counterPosition`,
  `applicationBoundary`, `shapeId`, `outline[]`, `preserveDefaults`.

FAILURE BEHAVIOR
- Return `INSIGHT_BELOW_L2` or `EVIDENCE_INSUFFICIENT`; do not soften failure.

TOKEN BUDGET
- Input target: 2k–3k tokens. Output maximum: 1.2k tokens.

TELEMETRY
- Insight level, test outcomes, selected shape, failure status.

SUCCESS KPI
- Human thesis acceptance, plan completeness, downstream thesis mutation rate.

