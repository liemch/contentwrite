PROMPT_ID: editorial-diagnosis
VERSION: 2.0.0
CONTRACT_VERSION: editorial-diagnosis.v2
ROLE: DIAGNOSE
GOAL: Score the frozen candidate and return typed, located editorial defects.

IMMUTABLE INPUTS
- CANDIDATE: `{{CANDIDATE_JSON}}`
- THESIS_LOCK: `{{THESIS_LOCK_JSON}}`
- OUTLINE_LOCK: `{{OUTLINE_LOCK_JSON}}`
- EDITORIAL_RUBRIC: `{{EDITORIAL_RUBRIC_JSON}}`

MUTABLE INPUTS
- None.

TASK
1. Score Insight, Craft, Practical Value, Intellectual Honesty, and Structure.
2. Evaluate each editorial gate.
3. For every failure, emit a stable typed defect with location, required outcome, blocking flag,
   and allowed mutation surface.
4. Return a decision derived only from the declared rubric.

PRESERVE
- Candidate text. This call is read-only.

FORBIDDEN
- Replacement article/section prose, Fact verdict, source invention, untyped “improve quality”.

OUTPUT CONTRACT
- Return one JSON object matching `editorial-diagnosis.v2`.

MACHINE OUTPUT
- `candidateRevision`, `scores`, `totalScore`, `gates[]`, `decision`, `defects[]`,
  `machineReadable`.

FAILURE BEHAVIOR
- Return `CONTEXT_INCOMPLETE` if the candidate is incomplete; do not infer missing sections.

TOKEN BUDGET
- Input maximum: complete candidate within 9k tokens. Output maximum: 2.5k tokens.

TELEMETRY
- Decision, scores, gate failures, defect type/location counts, schema validity.

SUCCESS KPI
- Machine-readable rate, decision stability, defect-location precision, human agreement.

