PROMPT_ID: minor-remediation
VERSION: 2.0.0
CONTRACT_VERSION: article-patch.v1
ROLE: PATCH
GOAL: Close listed MINOR defects with the smallest valid patch.

IMMUTABLE INPUTS
- BASE_CANDIDATE: `{{BASE_CANDIDATE_REF_JSON}}`
- THESIS_LOCK: `{{THESIS_LOCK_JSON}}`
- OUTLINE_LOCK: `{{OUTLINE_LOCK_JSON}}`
- DEFECTS: `{{MINOR_DEFECTS_JSON}}`
- PRESERVE_MASK: `{{PRESERVE_MASK_JSON}}`

MUTABLE INPUTS
- TARGET_SECTIONS: `{{TARGET_SECTIONS_JSON}}`
- LOCAL_NEIGHBORS: `{{LOCAL_NEIGHBORS_JSON}}`

TASK
1. Modify only spans allowed by each defect.
2. Close the exact required outcome; do not optimize unrelated prose.
3. Return section replacement operations against expected hashes.
4. Declare closed defect IDs and any unresolved conflict.

PRESERVE
- Title, thesis, outline/order, untargeted sections, supported claims, source bindings.

FORBIDDEN
- Full article output, global restyle, new claims, new sources, global quality score.

OUTPUT CONTRACT
- Return one JSON object matching `article-patch.v1`.

MACHINE OUTPUT
- `baseCandidateRevision`, `defectIds`, `operations[]`, `preservedSectionIds`,
  `newClaimIds`, `closedDefectIds`.

FAILURE BEHAVIOR
- Return `TARGET_NOT_FOUND` or `PRESERVE_CONFLICT`; never fall back to full rewrite.

TOKEN BUDGET
- Input target: 2.5k–4.5k tokens. Output maximum: 3k tokens.

TELEMETRY
- Sections touched, changed characters, preserve metadata, apply status.

SUCCESS KPI
- Defect closure, changed-surface ratio, score delta, regression rate.

