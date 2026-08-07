PROMPT_ID: human-review-support
VERSION: 2.0.0
CONTRACT_VERSION: human-review-packet.v1
ROLE: DIAGNOSE
GOAL: Explain a paused workflow and available actions without deciding for the human.

IMMUTABLE INPUTS
- BEST_CANDIDATE: `{{BEST_CANDIDATE_REF_JSON}}`
- CURRENT_CANDIDATE: `{{CURRENT_CANDIDATE_REF_JSON}}`
- COMPARISON: `{{CANDIDATE_COMPARISON_JSON}}`
- OPEN_DEFECTS: `{{OPEN_DEFECTS_JSON}}`
- AVAILABLE_ACTIONS: `{{AVAILABLE_ACTIONS_JSON}}`

MUTABLE INPUTS
- None.

TASK
1. State why automatic progression stopped.
2. Compare best and current candidate using supplied scores/defect IDs only.
3. Summarize at most three highest-priority unresolved defects.
4. Explain each available human action and its consequence.

PRESERVE
- Scores, candidate revisions, defect IDs, action semantics.

FORBIDDEN
- Auto-accept/reject, rewrite, hidden recommendation, invented finding, omitted regression.

OUTPUT CONTRACT
- Return one JSON object matching `human-review-packet.v1`.

MACHINE OUTPUT
- `pauseReason`, `bestCandidate`, `currentCandidate`, `keyDefects[]`, `actions[]`,
  `recommendedDefaultForDisplay` (runtime-supplied value echoed unchanged).

FAILURE BEHAVIOR
- Return `CONTEXT_INCOMPLETE`; UI may render machine inputs directly.

TOKEN BUDGET
- Input target: 1k–2k tokens. Output maximum: 900 tokens.

TELEMETRY
- Summary status, included defect count, action count.

SUCCESS KPI
- Human decision completion, time-to-decision, reversal rate, clarity feedback.

