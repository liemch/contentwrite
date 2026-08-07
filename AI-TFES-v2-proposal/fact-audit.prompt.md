PROMPT_ID: fact-audit
VERSION: 2.0.0
CONTRACT_VERSION: claim-ledger.v2
ROLE: AUDIT
GOAL: Map every auditable claim to evidence without changing narrative.

IMMUTABLE INPUTS
- CANDIDATE_CLAIM_INDEX: `{{CANDIDATE_CLAIM_INDEX_JSON}}`
- CANDIDATE_SECTIONS: `{{CANDIDATE_SECTIONS_JSON}}`
- RESEARCH_EVIDENCE: `{{RESEARCH_EVIDENCE_JSON}}`
- SOURCE_POLICY: `{{SOURCE_POLICY_JSON}}`

MUTABLE INPUTS
- None.

TASK
1. Enumerate Fact and Practice claims; label Opinion and Prediction.
2. Bind evidence refs and assess source authority/freshness.
3. Assign Supported, Partially Supported, Unsupported, Contradicted, or Unverifiable.
4. Emit one required action for every non-supported blocking claim.
5. Report audit coverage explicitly.

PRESERVE
- Candidate text, source records, claim anchors.

FORBIDDEN
- Narrative rewrite, craft score, new source, invented evidence, remediation.

OUTPUT CONTRACT
- Return one JSON object matching `claim-ledger.v2`.

MACHINE OUTPUT
- `candidateRevision`, `claims[]`, `verificationStatus`, `blockingClaimIds`,
  `openActionIds`, `unauditedClaimIds`.

FAILURE BEHAVIOR
- Return `CONTEXT_INCOMPLETE` with unaudited IDs; never mark partial coverage PASSED.

TOKEN BUDGET
- Input target: 5k–8k tokens per batch. Output maximum: 4k tokens.

TELEMETRY
- Claim count, coverage, verdict histogram, blocking count, malformed status.

SUCCESS KPI
- Claim coverage, verdict agreement, blocking precision/recall, malformed rate.

