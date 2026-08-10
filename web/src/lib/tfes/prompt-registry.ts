import { extractMarkedJson } from "@/lib/tfes/machine-contract";
import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

export type PromptRole =
  | "DIAGNOSE"
  | "PATCH"
  | "LOCK"
  | "GENERATE"
  | "RESEARCH"
  | "AUDIT"
  | "PLAN";

export type PromptArchitectureId =
  | "editorial-diagnosis"
  | "minor-remediation"
  | "major-remediation"
  | "rewrite-remediation"
  | "lock-verifier"
  | "research-packet"
  | "fact-audit"
  | "fact-remediation"
  | "insight-lock"
  | "draft-generation"
  | "insight-gate"
  | "editorial-decision"
  | "publish-renderer"
  | "publish-polish"
  | "publish-expansion"
  | "publish-quality-repair"
  | "human-polish"
  | "hero-brief"
  | "reader-audit";

export type PromptRuntimeVersion = "1.6" | "2.0";

export type PromptDescriptor = {
  promptId: PromptArchitectureId;
  promptVersion: PromptRuntimeVersion;
  contractVersion: string;
  role: PromptRole;
  source: string;
  fallbackReason: "disabled" | "unknown-version" | null;
};

export type PromptExecutionTelemetry = {
  promptId: PromptArchitectureId;
  promptVersion: PromptRuntimeVersion;
  contractVersion: string;
  role: PromptRole;
  source: string;
  promptArchitectureVersion: PromptRuntimeVersion;
  contextCharacterLength: number;
  legacyContextCharacterLength: number | null;
  contextReductionCharacters: number | null;
  contextReductionRatio: number | null;
  inputTokenEstimate: number;
  defectCount?: number | null;
  remediationMedium?:
    | "full-draft-preserve"
    | "full-draft-major"
    | "full-draft-rewrite"
    | "full-draft-fact-repair"
    | "patch";
  lockDecision?: string | null;
  blockingResidualCount?: number | null;
  falseMinorSuppressed?: boolean;
  malformedOutput?: boolean;
  parserVersion?: string | null;
  malformedReasonCode?: string | null;
  rawOutputLength?: number | null;
  outputTruncated?: "known" | "suspected" | null;
  formatRetryCount?: number | null;
  formatRetrySucceeded?: boolean | null;
};

type DescriptorCore = Omit<PromptDescriptor, "promptId" | "fallbackReason">;

const V1: Record<PromptArchitectureId, DescriptorCore> = {
  "editorial-diagnosis": {
    promptVersion: "1.6",
    contractVersion: "editorial-review-canonical",
    role: "DIAGNOSE",
    source: "content/ai-tfes+prompts.ts",
  },
  "minor-remediation": {
    promptVersion: "1.6",
    contractVersion: "article-full-draft-v1.6",
    role: "PATCH",
    source: "content/ai-tfes+prompts.ts",
  },
  "major-remediation": {
    promptVersion: "1.6",
    contractVersion: "article-full-draft-v1.6",
    role: "PATCH",
    source: "content/ai-tfes+prompts.ts",
  },
  "rewrite-remediation": {
    promptVersion: "1.6",
    contractVersion: "article-full-draft-v1.6",
    role: "GENERATE",
    source: "content/ai-tfes+prompts.ts",
  },
  "lock-verifier": {
    promptVersion: "1.6",
    contractVersion: "final-verification-v1",
    role: "LOCK",
    source: "content/ai-tfes+prompts.ts",
  },
  "research-packet": {
    promptVersion: "1.6",
    contractVersion: "research-brief-v1.6",
    role: "RESEARCH",
    source: "content/ai-tfes+prompts.ts",
  },
  "fact-audit": {
    promptVersion: "1.6",
    contractVersion: "factcheck-ledger-v1.6",
    role: "AUDIT",
    source: "content/ai-tfes+prompts.ts",
  },
  "fact-remediation": {
    promptVersion: "1.6",
    contractVersion: "article-full-draft-v1.6",
    role: "PATCH",
    source: "content/ai-tfes+prompts.ts",
  },
  "insight-lock": {
    promptVersion: "1.6",
    contractVersion: "insight-planning-v1.6",
    role: "PLAN",
    source: "content/ai-tfes+prompts.ts",
  },
  "draft-generation": {
    promptVersion: "1.6",
    contractVersion: "article-write-v1.6",
    role: "GENERATE",
    source: "content/ai-tfes+prompts.ts",
  },
  "insight-gate": {
    promptVersion: "1.6",
    contractVersion: "insight-gate-v1.6",
    role: "DIAGNOSE",
    source: "content/ai-tfes+prompts.ts",
  },
  "editorial-decision": {
    promptVersion: "1.6",
    contractVersion: "editorial-decision-v1.6",
    role: "PLAN",
    source: "content/ai-tfes+prompts.ts",
  },
  "publish-renderer": {
    promptVersion: "1.6",
    contractVersion: "publish-article-v1.6",
    role: "GENERATE",
    source: "content/ai-tfes+prompts.ts",
  },
  "publish-polish": {
    promptVersion: "1.6",
    contractVersion: "polished-article-v1.6",
    role: "PATCH",
    source: "content/ai-tfes+prompts.ts",
  },
  "publish-expansion": {
    promptVersion: "1.6",
    contractVersion: "expanded-article-v1.6",
    role: "PATCH",
    source: "content/ai-tfes+prompts.ts",
  },
  "publish-quality-repair": {
    promptVersion: "1.6",
    contractVersion: "repaired-article-v1.6",
    role: "PATCH",
    source: "content/ai-tfes+prompts.ts",
  },
  "human-polish": {
    promptVersion: "1.6",
    contractVersion: "human-preserving-polish-v1.6",
    role: "PATCH",
    source: "content/ai-tfes+prompts.ts",
  },
  "hero-brief": {
    promptVersion: "1.6",
    contractVersion: "hero-brief-v1.6",
    role: "GENERATE",
    source: "content/ai-tfes+prompts.ts",
  },
  "reader-audit": {
    promptVersion: "1.6",
    contractVersion: "reader-simulation-v1.6",
    role: "AUDIT",
    source: "content/ai-tfes+prompts.ts",
  },
};

const V2: Record<PromptArchitectureId, DescriptorCore> = {
  "editorial-diagnosis": {
    promptVersion: "2.0",
    contractVersion: "editorial-diagnosis.v2",
    role: "DIAGNOSE",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "minor-remediation": {
    promptVersion: "2.0",
    contractVersion: "article-patch.v1",
    role: "PATCH",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "major-remediation": {
    promptVersion: "2.0",
    contractVersion: "article-patch.v1",
    role: "PATCH",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "rewrite-remediation": {
    promptVersion: "2.0",
    contractVersion: "full-draft-rewrite.v2",
    role: "GENERATE",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "lock-verifier": {
    promptVersion: "2.0",
    contractVersion: "lock-decision.v2",
    role: "LOCK",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "research-packet": {
    promptVersion: "2.0",
    contractVersion: "research-packet.v2",
    role: "RESEARCH",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "fact-audit": {
    promptVersion: "2.0",
    contractVersion: "claim-ledger.v2",
    role: "AUDIT",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "fact-remediation": {
    promptVersion: "2.0",
    contractVersion: "claim-patch.v1",
    role: "PATCH",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "insight-lock": {
    promptVersion: "2.0",
    contractVersion: "insight-plan-lock.v2",
    role: "PLAN",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "draft-generation": {
    promptVersion: "2.0",
    contractVersion: "article-candidate.v2",
    role: "GENERATE",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "insight-gate": {
    promptVersion: "2.0",
    contractVersion: "insight-gate.v2",
    role: "DIAGNOSE",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "editorial-decision": {
    promptVersion: "2.0",
    contractVersion: "editorial-decision.v2",
    role: "PLAN",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "publish-renderer": {
    promptVersion: "2.0",
    contractVersion: "publish-renderer.v2",
    role: "GENERATE",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "publish-polish": {
    promptVersion: "2.0",
    contractVersion: "publish-polish.v2",
    role: "PATCH",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "publish-expansion": {
    promptVersion: "2.0",
    contractVersion: "publish-expansion.v2",
    role: "PATCH",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "publish-quality-repair": {
    promptVersion: "2.0",
    contractVersion: "publish-quality-repair.v2",
    role: "PATCH",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "human-polish": {
    promptVersion: "2.0",
    contractVersion: "human-polish.v2",
    role: "PATCH",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "hero-brief": {
    promptVersion: "2.0",
    contractVersion: "hero-brief.v2",
    role: "GENERATE",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "reader-audit": {
    promptVersion: "2.0",
    contractVersion: "reader-audit.v2",
    role: "AUDIT",
    source: "src/lib/tfes/prompts-v2.ts",
  },
};

function configuredVersion(id: PromptArchitectureId): string {
  const config = PIPELINE_CONFIG.aiTfesV2.promptArchitecture;
  switch (id) {
    case "editorial-diagnosis":
      return config.editorialDiagnosisVersion;
    case "minor-remediation":
      return config.minorRemediationVersion;
    case "major-remediation":
      return config.majorRemediationVersion;
    case "rewrite-remediation":
      return config.rewriteRemediationVersion;
    case "lock-verifier":
      return config.lockVerifierVersion;
    case "research-packet":
      return config.researchPacketVersion;
    case "fact-audit":
      return config.factAuditVersion;
    case "fact-remediation":
      return config.factRemediationVersion;
    case "insight-lock":
      return config.insightLockVersion;
    case "draft-generation":
      return config.draftGenerationVersion;
    case "insight-gate":
      return config.insightGateVersion;
    case "editorial-decision":
      return config.editorialDecisionVersion;
    case "publish-renderer":
      return config.publishRendererVersion;
    case "publish-polish":
      return config.publishPolishVersion;
    case "publish-expansion":
      return config.publishExpansionVersion;
    case "publish-quality-repair":
      return config.publishQualityRepairVersion;
    case "human-polish":
      return config.humanPolishVersion;
    case "hero-brief":
      return config.heroBriefVersion;
    case "reader-audit":
      return config.readerAuditVersion;
    default:
      return "1.6";
  }
}

export function resolvePromptDescriptor(
  promptId: PromptArchitectureId,
  options?: { enabled?: boolean; requestedVersion?: string },
): PromptDescriptor {
  const enabled =
    options?.enabled ?? PIPELINE_CONFIG.aiTfesV2.promptArchitecture.enabled;
  const requested = options?.requestedVersion ?? configuredVersion(promptId);
  if (!enabled) {
    return { promptId, ...V1[promptId], fallbackReason: "disabled" };
  }
  if (requested === "2.0") {
    return { promptId, ...V2[promptId], fallbackReason: null };
  }
  return { promptId, ...V1[promptId], fallbackReason: "unknown-version" };
}

export function estimateInputTokens(contextCharacterLength: number): number {
  return Math.max(0, Math.ceil(contextCharacterLength / 4));
}

export function buildPromptExecutionTelemetry(input: {
  descriptor: PromptDescriptor;
  contextCharacterLength: number;
  legacyContextCharacterLength?: number | null;
  defectCount?: number | null;
  remediationMedium?: PromptExecutionTelemetry["remediationMedium"];
  lockDecision?: string | null;
  blockingResidualCount?: number | null;
  falseMinorSuppressed?: boolean;
  malformedOutput?: boolean;
  parserVersion?: string | null;
  malformedReasonCode?: string | null;
  rawOutputLength?: number | null;
  outputTruncated?: "known" | "suspected" | null;
  formatRetryCount?: number | null;
  formatRetrySucceeded?: boolean | null;
}): PromptExecutionTelemetry {
  const contextChars = Math.max(0, Math.round(input.contextCharacterLength));
  const legacyChars =
    typeof input.legacyContextCharacterLength === "number"
      ? Math.max(0, Math.round(input.legacyContextCharacterLength))
      : null;
  const reduction = legacyChars === null ? null : legacyChars - contextChars;
  return {
    promptId: input.descriptor.promptId,
    promptVersion: input.descriptor.promptVersion,
    contractVersion: input.descriptor.contractVersion,
    role: input.descriptor.role,
    source: input.descriptor.source,
    promptArchitectureVersion:
      input.descriptor.promptVersion === "2.0" ? "2.0" : "1.6",
    contextCharacterLength: contextChars,
    legacyContextCharacterLength: legacyChars,
    contextReductionCharacters: reduction,
    contextReductionRatio:
      legacyChars && reduction !== null
        ? Number((reduction / legacyChars).toFixed(4))
        : null,
    inputTokenEstimate: estimateInputTokens(contextChars),
    ...(input.defectCount !== undefined ? { defectCount: input.defectCount } : {}),
    ...(input.remediationMedium
      ? { remediationMedium: input.remediationMedium }
      : {}),
    ...(input.lockDecision !== undefined
      ? { lockDecision: input.lockDecision }
      : {}),
    ...(input.blockingResidualCount !== undefined
      ? { blockingResidualCount: input.blockingResidualCount }
      : {}),
    ...(input.falseMinorSuppressed !== undefined
      ? { falseMinorSuppressed: input.falseMinorSuppressed }
      : {}),
    ...(input.malformedOutput !== undefined
      ? { malformedOutput: input.malformedOutput }
      : {}),
    ...(input.parserVersion !== undefined
      ? { parserVersion: input.parserVersion }
      : {}),
    ...(input.malformedReasonCode !== undefined
      ? { malformedReasonCode: input.malformedReasonCode }
      : {}),
    ...(input.rawOutputLength !== undefined
      ? { rawOutputLength: Math.max(0, Math.round(input.rawOutputLength ?? 0)) }
      : {}),
    ...(input.outputTruncated !== undefined
      ? { outputTruncated: input.outputTruncated }
      : {}),
    ...(input.formatRetryCount !== undefined
      ? { formatRetryCount: input.formatRetryCount }
      : {}),
    ...(input.formatRetrySucceeded !== undefined
      ? { formatRetrySucceeded: input.formatRetrySucceeded }
      : {}),
  };
}

/** Parse only an explicitly marked JSON object; prose never becomes machine output. */
export function parseMarkedPromptJson(
  raw: string | null | undefined,
  marker: string,
): Record<string, unknown> | null {
  return extractMarkedJson(raw, marker).json;
}
