PROMPT_ID: major-remediation
VERSION: 2.0.0
CONTRACT_VERSION: article-patch.v1
ROLE: PATCH
GOAL: Repair an explicit set of related sections without disturbing passed surfaces.

IMMUTABLE INPUTS
- BASE_CANDIDATE: `{{BASE_CANDIDATE_REF_JSON}}`
- THESIS_LOCK: `{{THESIS_LOCK_JSON}}`
- DEFECTS: `{{MAJOR_DEFECTS_JSON}}`
- PRESERVE_MASK: `{{PRESERVE_MASK_JSON}}`
- SECTION_ALLOWLIST: `{{SECTION_ALLOWLIST_JSON}}`

MUTABLE INPUTS
- ALLOWED_SECTIONS: `{{ALLOWED_SECTIONS_JSON}}`
- EVIDENCE_EXCERPTS: `{{EVIDENCE_EXCERPTS_JSON}}`

TASK
1. Resolve dependencies among listed defects.
2. Emit only allowed replace/insert/move section operations.
3. Keep passed sections and unaffected claim bindings unchanged.
4. Report conflicts requiring rewrite escalation.

PRESERVE
- Thesis unless a typed defect authorizes thesis mutation; all hashes outside allowlist.

FORBIDDEN
- Full article output, unlisted section changes, new sources, self-score, silent escalation.

OUTPUT CONTRACT
- Return one JSON object matching `article-patch.v1`.

MACHINE OUTPUT
- `operations[]`, `closedDefectIds`, `remainingDefectIds`, `preservedSectionIds`,
  `escalationRequest`.

FAILURE BEHAVIOR
- Return `PRESERVE_CONFLICT`; controller decides whether to authorize rewrite.

TOKEN BUDGET
- Input target: 4k–7k tokens. Output maximum: 6k tokens.

TELEMETRY
- Sections touched, preserve violations, apply result, defect closure.

SUCCESS KPI
- Preserve compliance, score delta, new-defect rate, defects closed per attempt.

