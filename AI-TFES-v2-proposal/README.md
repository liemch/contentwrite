# AI-TFES v2 Prompt Proposal

This directory is a design artifact. Production code must not import, load, sync, or resolve
prompts from this path.

Included sample contracts:

- `research-packet.prompt.md`
- `insight-lock.prompt.md`
- `draft-generation.prompt.md`
- `editorial-diagnosis.prompt.md`
- `fact-audit.prompt.md`
- `minor-remediation.prompt.md`
- `major-remediation.prompt.md`
- `rewrite-remediation.prompt.md`
- `fact-remediation.prompt.md`
- `lock-verifier.prompt.md`
- `human-review-support.prompt.md`

The examples show prompt structure and machine contracts. Placeholders such as
`{{RESEARCH_PACKET}}` represent typed runtime inputs, not free-form string concatenation.
Runtime IDs, hashes, timestamps, state transitions, candidate promotion, and retry decisions
remain deterministic responsibilities outside the prompts.

