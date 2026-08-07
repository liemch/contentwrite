# TODOS

## AI-TFES RC2 (optimization — not PV blockers)

### Stronger MINOR context reduction without Section Patch

**What:** Reduce `minor-remediation@2.0` context further while keeping full-draft compatibility output until Patch Editing exists.

**Why:** Current v2 still embeds a large full-candidate block; measured `contextReductionRatio` under-delivers vs design target.

**Effort:** M  
**Priority:** P2  
**Depends on:** RC2 Preview cohort metrics

### Watch Lock Verifier `maxTokens=1500` malformed rate

**What:** Compare lock-v2 malformed / format-retry rate vs v1.6 2200 during canary; raise only if evidence warrants.

**Why:** Smaller ceiling may increase truncated JSON under long residual lists.

**Effort:** S  
**Priority:** P2  
**Depends on:** Canary telemetry

### Align admin login docs with multi-user email+password

**What:** Update config guides that still imply password-only admin login.

**Why:** Operators using “old” habits hit generic 401 after multi-user migration.

**Effort:** S  
**Priority:** P3

## Review

### Split workflow.ts god file

**What:** Decompose `web/src/lib/tfes/workflow.ts` (~2900 lines) into step-focused modules after the benchmark `WorkflowRuntime` seam lands.

**Why:** Eng review D14 kept the refactor seam-only for WP-E0A..E3, but the monolith still blocks safe workflow changes and raises merge conflict risk.

**Context:** Benchmark work injects `WorkflowRuntime` at `runWorkflowStep` and breaks the `auto-write/runner.ts` circular import first. Full decomposition should happen in a separate PR with characterization tests and no behavior changes. Start from the state-machine step boundaries already implied by `WorkflowState` transitions.

**Effort:** L
**Priority:** P2
**Depends on:** WP-E1 runtime seam merged

## Developer Experience

### Open a community discussion channel after adoption signal

**What:** Evaluate and open a dedicated benchmark community channel, preferring GitHub
Discussions before Discord.

**Why:** The v1 governance kit supports structured issues and scientific disputes, but an active
peer community is required before the ecosystem can reach best-in-class DX.

**Context:** Do not create an empty channel at launch. Trigger this decision after either
10 independent verifier users or 3 recurring external contributors. Use it for reproduction
reports, adapters, examples, and protocol discussion; retain security and private-data reports
in their dedicated channels.

**Effort:** S
**Priority:** P3
**Depends on:** Public pilot release and measured external adoption
