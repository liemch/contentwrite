import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

export type PromptRole = "DIAGNOSE" | "PATCH" | "LOCK";
export type PromptArchitectureId =
  | "editorial-diagnosis"
  | "minor-remediation"
  | "lock-verifier";
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
  remediationMedium?: "full-draft-preserve";
  lockDecision?: string | null;
  blockingResidualCount?: number | null;
  falseMinorSuppressed?: boolean;
  malformedOutput?: boolean;
};

const V1: Record<PromptArchitectureId, Omit<PromptDescriptor, "promptId" | "fallbackReason">> = {
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
  "lock-verifier": {
    promptVersion: "1.6",
    contractVersion: "final-verification-v1",
    role: "LOCK",
    source: "content/ai-tfes+prompts.ts",
  },
};

const V2: Record<PromptArchitectureId, Omit<PromptDescriptor, "promptId" | "fallbackReason">> = {
  "editorial-diagnosis": {
    promptVersion: "2.0",
    contractVersion: "editorial-diagnosis.v2",
    role: "DIAGNOSE",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "minor-remediation": {
    promptVersion: "2.0",
    contractVersion: "full-draft-preserve.v2",
    role: "PATCH",
    source: "src/lib/tfes/prompts-v2.ts",
  },
  "lock-verifier": {
    promptVersion: "2.0",
    contractVersion: "lock-decision.v2",
    role: "LOCK",
    source: "src/lib/tfes/prompts-v2.ts",
  },
};

function configuredVersion(id: PromptArchitectureId): string {
  const config = PIPELINE_CONFIG.aiTfesV2.promptArchitecture;
  if (id === "editorial-diagnosis") return config.editorialDiagnosisVersion;
  if (id === "minor-remediation") return config.minorRemediationVersion;
  return config.lockVerifierVersion;
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
  remediationMedium?: "full-draft-preserve";
  lockDecision?: string | null;
  blockingResidualCount?: number | null;
  falseMinorSuppressed?: boolean;
  malformedOutput?: boolean;
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
  };
}

/** Parse only an explicitly marked JSON object; prose never becomes machine output. */
export function parseMarkedPromptJson(
  raw: string | null | undefined,
  marker: string,
): Record<string, unknown> | null {
  const body = raw ?? "";
  const markerIndex = body.indexOf(marker);
  if (markerIndex < 0) return null;
  const after = body.slice(markerIndex + marker.length).trimStart();
  const candidate = after.startsWith("```")
    ? after.replace(/^```(?:json)?\s*/i, "").split(/```/)[0]?.trim() ?? ""
    : after;
  const start = candidate.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth !== 0) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, index + 1));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

