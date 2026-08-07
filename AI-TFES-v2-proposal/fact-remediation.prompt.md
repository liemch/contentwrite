PROMPT_ID: fact-remediation
VERSION: 2.0.0
CONTRACT_VERSION: claim-patch.v1
ROLE: PATCH
GOAL: Correct, hedge, label, or delete only the listed failing claims.

IMMUTABLE INPUTS
- BASE_CANDIDATE: `{{BASE_CANDIDATE_REF_JSON}}`
- TARGET_CLAIMS: `{{TARGET_CLAIMS_WITH_VERDICTS_JSON}}`
- EVIDENCE_EXCERPTS: `{{EVIDENCE_EXCERPTS_JSON}}`
- PRESERVE_CLAIM_IDS: `{{PRESERVE_CLAIM_IDS_JSON}}`

MUTABLE INPUTS
- CLAIM_SPANS: `{{TARGET_CLAIM_SPANS_JSON}}`
- LOCAL_NEIGHBORS: `{{LOCAL_NEIGHBORS_JSON}}`

TASK
1. Apply the ledger action for every target claim.
2. Preserve intended meaning only when supported; otherwise hedge, label, or delete.
3. Emit claim-local replacement operations and resulting claim disposition.

PRESERVE
- Thesis, structure, narrative outside target spans, all supported unaffected claims.

FORBIDDEN
- Full article output, global restyle, source discovery, invented evidence, craft score.

OUTPUT CONTRACT
- Return one JSON object matching `claim-patch.v1`.

MACHINE OUTPUT
- `baseCandidateRevision`, `operations[]`, `targetClaimIds`, `claimDispositions`,
  `newClaimIds`, `requiresFullFactAudit`.

FAILURE BEHAVIOR
- Return `EVIDENCE_INSUFFICIENT` and recommend delete/Opinion/Prediction; do not invent support.

TOKEN BUDGET
- Input target: 2k–4k tokens. Output maximum: 3k tokens.

TELEMETRY
- Target/touched claim counts, new claims, patch apply status.

SUCCESS KPI
- Blocking-claim reduction, touched-claim precision, re-audit pass rate.

