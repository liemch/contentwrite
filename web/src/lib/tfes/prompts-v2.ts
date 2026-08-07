import { appendContext, clipText } from "@/lib/tfes/parser";

export type EditorialDefectV2 = {
  defectId: string;
  type: string;
  severity: "MINOR" | "MAJOR" | "REWRITE";
  location: {
    sectionId: string;
    anchorStart?: string;
    anchorEnd?: string;
  };
  diagnosis: string;
  requiredOutcome: string;
  allowedMutations: string[];
  evidenceRefs: string[];
  blocking: boolean;
};

export type EditorialGateV2 = {
  id: string;
  status: "PASSED" | "FAILED";
  reason?: string;
};

export const EDITORIAL_DIAGNOSIS_MARKER_V2 = "EDITORIAL_DIAGNOSIS_JSON:";
const MAX_EDITORIAL_DEFECTS = 12;

type MarkdownSection = {
  id: string;
  heading: string;
  content: string;
};

function sectionId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[*`#]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function markdownSections(draft: string): MarkdownSection[] {
  const matches = [...draft.matchAll(/^#{1,3}\s+(.+)$/gm)];
  return matches.map((match, index) => {
    const heading = match[1].trim();
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? draft.length;
    return {
      id: index === 0 && match[0].startsWith("# ") ? "title" : sectionId(heading),
      heading,
      content: draft.slice(start, end).trim(),
    };
  });
}

export function buildEditorialDiagnosisContextV2(input: {
  insightPlan: string | null | undefined;
  draft: string;
  articleShape: string;
  maxDraftChars: number;
}): string {
  return appendContext(
    `THESIS_AND_OUTLINE_LOCK:\n${clipText(input.insightPlan, 4_000)}`,
    `ARTICLE_SHAPE:\n${clipText(input.articleShape, 2_500)}`,
    `FROZEN_CANDIDATE:\n${clipText(input.draft, input.maxDraftChars)}`,
  );
}

export function buildEditorialDiagnosisPromptV2(context: string): string {
  return `PROMPT_ID: editorial-diagnosis
VERSION: 2.0
CONTRACT_VERSION: editorial-diagnosis.v2
ROLE: DIAGNOSE

Diagnose the frozen Vietnamese article. Do not rewrite, continue, or propose replacement
Article.md prose. Score only these axes: Insight, Craft, Practical Value, Intellectual Honesty,
and Structure. Evidence remains provisional until Fact Audit.

Return exactly one marked JSON object. No machine decision may exist only in prose.

Output shape (replace placeholders with real values, keep key names exactly):

EDITORIAL_DIAGNOSIS_JSON:
{
  "contractVersion": "editorial-diagnosis.v2",
  "totalScore": <integer 1-100>,
  "insightScore": <integer 0-30>,
  "gates": [
    {"id":"G1","status":"PASSED|FAILED","reason":"<short>"},
    {"id":"G2","status":"PASSED|FAILED","reason":"<short>"},
    {"id":"G3","status":"PASSED|FAILED","reason":"<short>"},
    {"id":"G4","status":"PASSED|FAILED","reason":"<short>"},
    {"id":"G5","status":"PASSED|FAILED","reason":"<short>"},
    {"id":"G6","status":"PASSED|FAILED","reason":"<short>"},
    {"id":"G7","status":"PASSED|FAILED","reason":"<short>"},
    {"id":"G8","status":"PASSED|FAILED","reason":"<short>"}
  ],
  "decision": "EDITORIAL_REVIEWED|MINOR_REVISION_REQUIRED|MAJOR_REVISION_REQUIRED|REWRITE_REQUIRED",
  "defects": [],
  "requiredActions": []
}

Machine format rules (violating any of these voids the response):
- Emit the marker line ${EDITORIAL_DIAGNOSIS_MARKER_V2} exactly once, then the JSON object.
- After the JSON object, write nothing at all. No prose, no code fence, no summary.
- totalScore and insightScore are JSON numbers, never strings, never 0 placeholders,
  never "85/100".
- gates is an array with all eight entries G1..G8; status is exactly PASSED or FAILED.
- decision uses one exact enum value, uppercase with underscores.
- No trailing comma, no comment, no unescaped newline inside a string.
- Keep the whole object under ${MAX_EDITORIAL_DEFECTS} defects so the response is never truncated.

Content rules:
- Every defect must include defectId, type, severity, location.sectionId, diagnosis,
  requiredOutcome, allowedMutations, evidenceRefs, and blocking.
- severity is MINOR | MAJOR | REWRITE; blocking is a JSON boolean.
- Defects diagnose only. Do not include replacement section/article content.
- EDITORIAL_REVIEWED requires totalScore >=85, insightScore >=20, and G1–G8 PASSED.
- Unknown extra JSON fields are allowed; required fields above are mandatory.

=== CONTEXT ===
${context}`;
}

/**
 * Format-only repair. Re-emits the previous judgement in the machine contract
 * without re-reviewing the article, so scores cannot drift on a parser retry.
 */
export function buildEditorialFormatRepairPromptV2(input: {
  previousOutput: string;
  malformedReason: string;
}): string {
  return `PROMPT_ID: editorial-diagnosis
VERSION: 2.0
CONTRACT_VERSION: editorial-diagnosis.v2
ROLE: FORMAT_REPAIR

Your previous Editorial Diagnosis could not be parsed (reason: ${input.malformedReason}).

Do NOT review the article again. Do NOT change any judgement you already made.
Convert the previous output below into the exact machine contract and nothing else.

- Reuse the scores, gate statuses, decision, defects, and required actions already present.
- If a required value is genuinely absent from the previous output, infer nothing:
  emit the most conservative value consistent with what is present
  (missing gate status -> FAILED, missing decision -> MINOR_REVISION_REQUIRED).
- Never emit 0 for totalScore.

Emit the marker line ${EDITORIAL_DIAGNOSIS_MARKER_V2} exactly once, then one JSON object with
keys contractVersion, totalScore, insightScore, gates (G1..G8), decision, defects,
requiredActions. Numbers are JSON numbers. No prose before or after the object.
No code fence. No trailing comma.

=== PREVIOUS OUTPUT ===
${clipText(input.previousOutput, 8_000)}`;
}

export function buildMinorRemediationContextV2(input: {
  defects: EditorialDefectV2[];
  requiredActions: string[];
  fallbackFeedback: string;
  draft: string;
  evidenceSummary: unknown;
  maxDraftChars: number;
}): {
  context: string;
  targetSectionIds: string[];
  preserveSectionIds: string[];
} {
  const sections = markdownSections(input.draft);
  const requested = new Set(
    input.defects.flatMap((defect) => [
      defect.location.sectionId,
      ...defect.allowedMutations,
    ]).map(sectionId),
  );
  const targetIndexes = sections
    .map((section, index) => (requested.has(section.id) ? index : -1))
    .filter((index) => index >= 0);
  const contextIndexes = new Set<number>();
  for (const index of targetIndexes) {
    contextIndexes.add(index);
    if (index > 0) contextIndexes.add(index - 1);
    if (index + 1 < sections.length) contextIndexes.add(index + 1);
  }
  const targetSectionIds = targetIndexes.map((index) => sections[index].id);
  const preserveSectionIds = sections
    .filter((_, index) => !targetIndexes.includes(index))
    .map((section) => section.id);
  const localContext = [...contextIndexes]
    .sort((a, b) => a - b)
    .map((index) => {
      const section = sections[index];
      return {
        sectionId: section.id,
        heading: section.heading,
        relation: targetIndexes.includes(index) ? "target" : "neighbor",
        anchorStart: section.content.slice(0, 240),
        anchorEnd: section.content.slice(-240),
      };
    });
  const required =
    input.defects.length || input.requiredActions.length
      ? JSON.stringify(
          { defects: input.defects, requiredActions: input.requiredActions },
          null,
          2,
        )
      : input.fallbackFeedback;

  return {
    targetSectionIds,
    preserveSectionIds,
    context: appendContext(
      `REQUIRED_DEFECTS_AND_ACTIONS:\n${clipText(required, 3_500)}`,
      `PRESERVE_MASK:\n${JSON.stringify({
        preserveSectionIds,
        preserveTitle: !targetSectionIds.includes("title"),
        preserveThesis: !input.defects.some(
          (defect) =>
            defect.type === "THESIS_INVALID" ||
            defect.type === "INSIGHT_ALIGNMENT",
        ),
        preserveOutline: true,
        preserveSectionOrdering: true,
      })}`,
      `TARGET_SECTIONS: ${targetSectionIds.join(", ") || "infer only from required action location"}`,
      localContext.length > 0
        ? `TARGET_AND_NEIGHBOR_INDEX:\n${clipText(
            JSON.stringify(localContext),
            2_500,
          )}`
        : "",
      `MINIMAL_EVIDENCE:\n${clipText(JSON.stringify(input.evidenceSummary), 1_200)}`,
      `BASE_CANDIDATE_FULL_FOR_COMPATIBILITY:\n${clipText(
        input.draft,
        input.maxDraftChars,
      )}`,
    ),
  };
}

export function buildMinorRemediationPromptV2(context: string): string {
  return `PROMPT_ID: minor-remediation
VERSION: 2.0
CONTRACT_VERSION: full-draft-preserve.v2
ROLE: PATCH

Apply only the listed MINOR defects/actions. Do not diagnose again and do not self-score.
This runtime temporarily requires a complete Article.md response, but the operation is a
minimum edit—not a global rewrite.

PRESERVE:
- title unless explicitly targeted;
- main thesis/insight unless explicitly targeted;
- outline and section ordering;
- every unrelated section and supported claim;
- source semantics and URLs.

FORBIDDEN:
- global restyle;
- new claims or sources not required by a listed defect;
- changing an unlisted section;
- emitting Review, Fact Ledger, score, or decision.

Output the complete Markdown draft beginning with "# Title". Then append exactly two best-effort
metadata lines:
UNCHANGED_SECTIONS: <comma-separated headings>
CHANGED_SECTIONS: <comma-separated headings>

Missing metadata must not make the draft incomplete.

=== CONTEXT ===
${context}`;
}

export function buildLockVerifierContextV2(input: {
  editorialResult: unknown;
  factSummary: unknown;
  blockingClaims: unknown[];
  insightPlan: string | null | undefined;
  regressionSummary: unknown;
  candidateSignal: string;
}): string {
  return appendContext(
    `EDITORIAL_PASS_AND_DEFECTS:\n${clipText(JSON.stringify(input.editorialResult), 3_000)}`,
    `FACT_LOCK_SUMMARY:\n${clipText(
      JSON.stringify({
        summary: input.factSummary,
        blockingClaims: input.blockingClaims,
      }),
      2_500,
    )}`,
    `THESIS_LOCK:\n${clipText(input.insightPlan, 1_500)}`,
    `REGRESSION_SUMMARY:\n${clipText(JSON.stringify(input.regressionSummary), 1_000)}`,
    `CANDIDATE_SIGNAL_FOR_INSIGHT_FLOOR:\n${clipText(input.candidateSignal, 5_000)}`,
  );
}

export function buildLockVerifierPromptV2(context: string): string {
  return `PROMPT_ID: lock-verifier
VERSION: 2.0
CONTRACT_VERSION: lock-decision.v2
ROLE: LOCK

Verify only the lock surface: Fact PASS, blocking claims, required actions, evidence lock,
insight floor, unresolved blocking defects, and regression. Editorial craft already passed.
Do not re-score the whole craft surface, rewrite prose, or invent remediation.

Craft-only polish is optional and must not create PATCH_REQUIRED or a full rewrite loop.
Put it in optionalPolishActions while keeping lockDecision=LOCKED when all lock conditions pass.

Return exactly one marked JSON object:
LOCK_DECISION_JSON:
{
  "contractVersion": "lock-decision.v2",
  "lockDecision": "LOCKED",
  "factLockStatus": "PASSED",
  "insightFloorStatus": "PASSED",
  "blockingResiduals": [],
  "openRequiredActions": [],
  "unresolvedDefectIds": [],
  "regressionDetected": false,
  "optionalPolishActions": []
}

lockDecision enum:
- LOCKED
- PATCH_REQUIRED
- FACT_PATCH_REQUIRED
- REWRITE_ESCALATION_REQUESTED
- CONTEXT_INCOMPLETE

LOCKED requires Fact PASSED, no blocking residual/action/defect, insight floor PASSED, and no
regression. Unknown or missing required context must return CONTEXT_INCOMPLETE.

=== CONTEXT ===
${context}`;
}

