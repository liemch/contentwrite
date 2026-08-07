import { getDeploymentVersion } from "@/lib/deployment-version";
import type { ConvergenceTelemetry } from "@/lib/tfes/convergence-telemetry";
import type { FactCheckSummary } from "@/lib/tfes/fact-ledger";
import type { PromptExecutionTelemetry } from "@/lib/tfes/prompt-registry";
import {
  activeAiTfesVersion,
  PIPELINE_CONFIG,
  type AiTfesVersion,
} from "@/lib/tfes/pipeline-config";

export const REMEDIATION_TELEMETRY_VERSION = "wp2.7-v1";

export type RemediationResult = "pass" | "fail" | "retry" | "exhausted" | "error";
export type RemediationErrorClass = "content" | "parser" | "runtime" | "timeout" | null;

export type FinalMinorGuardTelemetry = {
  finalMinorGuardEligible: boolean;
  finalMinorSuppressed: boolean;
  finalMinorReasonClass: string;
  finalScore: number | null;
  editorialScore: number | null;
  factPassed: boolean;
  blockingResidualCount: number;
  guardEnabled: boolean;
};

export type MinorPreserveTelemetry = {
  minorPreservePromptVersion: string | null;
  changedSectionCount: number | null;
  unchangedSectionCount: number | null;
  preserveMetadataReadable: boolean;
};

export type AutoAckBrakeTelemetry = {
  autoAckEligible: boolean;
  autoAckSuppressedForRegression: boolean;
  bestScore: number | null;
  candidateScore: number | null;
  scoreDelta: number | null;
  epsilon: number;
  humanBrakeTriggered: boolean;
  brakeEnabled: boolean;
  reason: "regression" | "unreadable" | "not-eligible" | "disabled";
};

export type RemediationTelemetry = {
  schemaVersion: typeof REMEDIATION_TELEMETRY_VERSION;
  articleId: string;
  workflowState: string;
  transitionName: string;
  attempt: number | null;
  retryCount: number | null;
  /** @deprecated Prefer cycleRemediationCount; kept as cycle alias for older rows. */
  remediationCount: number | null;
  /** All remediations of this action in the workflow run; never reset by recovery. */
  lifetimeRemediationCount: number | null;
  /** Remediations after the latest cycle anchor; gates the live retry budget. */
  cycleRemediationCount: number | null;
  gateFailCount: number | null;
  gateFailures: string[];
  failureReasons: string[];
  totalScore: number | null;
  machineReadable: boolean | null;
  machineContract: string | null;
  decision: string | null;
  draftCharacterLength: number;
  hasKeyTakeaways: boolean;
  hasDiscussion: boolean;
  hasReferences: boolean;
  maxTokens: number | null;
  llmMs: number | null;
  errorClass: RemediationErrorClass;
  result: RemediationResult;
  deploymentVersion: string;
  aiTfesVersion: AiTfesVersion;
  aiTfesConfig: {
    bestCandidateLock: boolean;
    bestCandidateEpsilon: number;
    falseFinalMinorGuard: boolean;
    minorPreservePrompt: boolean;
    regressionAutoAckBrake: boolean;
    promptArchitecture: boolean;
  };
  /** Present only on Fact Check transitions; counts from the existing ledger parser. */
  fact?: FactCheckSummary;
  /** Additive WP-V2-01 trajectory observation; never controls workflow behavior. */
  convergence?: ConvergenceTelemetry;
  finalMinorGuard?: FinalMinorGuardTelemetry;
  minorPreserve?: MinorPreserveTelemetry;
  autoAckBrake?: AutoAckBrakeTelemetry;
  prompt?: PromptExecutionTelemetry;
};

export type RemediationTelemetryInput = {
  articleId: string;
  workflowState: string;
  transitionName: string;
  draft: string | null | undefined;
  result: RemediationResult;
  attempt?: number | null;
  retryCount?: number | null;
  remediationCount?: number | null;
  lifetimeRemediationCount?: number | null;
  cycleRemediationCount?: number | null;
  gateFailCount?: number | null;
  gateFailures?: string[];
  failureReasons?: string[];
  totalScore?: number | null;
  machineReadable?: boolean | null;
  machineContract?: string | null;
  decision?: string | null;
  maxTokens?: number | null;
  llmMs?: number | null;
  errorClass?: RemediationErrorClass;
  fact?: FactCheckSummary;
  convergence?: ConvergenceTelemetry;
  finalMinorGuard?: FinalMinorGuardTelemetry;
  minorPreserve?: MinorPreserveTelemetry;
  autoAckBrake?: AutoAckBrakeTelemetry;
  prompt?: PromptExecutionTelemetry;
};

function safeInteger(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null;
}

function safeReason(value: string): string {
  return value
    .replace(
      /\b(api[_-]?key|authorization|bearer|secret|token)\b\s*[:=]\s*\S+/gi,
      "$1=[redacted]",
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

function hasSection(draft: string, names: string[]): boolean {
  return names.some((name) => new RegExp(`^#{1,3}\\s*${name}\\b`, "im").test(draft));
}

export function buildRemediationTelemetry(
  input: RemediationTelemetryInput,
): RemediationTelemetry {
  const draft = input.draft ?? "";
  const deployment = getDeploymentVersion();
  const gateFailures = [...new Set(input.gateFailures ?? [])]
    .map((code) => code.toUpperCase())
    .filter((code) => /^G[1-8]$/.test(code))
    .slice(0, 8);

  return {
    schemaVersion: REMEDIATION_TELEMETRY_VERSION,
    articleId: input.articleId,
    workflowState: input.workflowState,
    transitionName: input.transitionName,
    attempt: safeInteger(input.attempt),
    retryCount: safeInteger(input.retryCount),
    remediationCount: safeInteger(
      input.cycleRemediationCount ?? input.remediationCount,
    ),
    lifetimeRemediationCount: safeInteger(input.lifetimeRemediationCount),
    cycleRemediationCount: safeInteger(
      input.cycleRemediationCount ?? input.remediationCount,
    ),
    gateFailCount: safeInteger(input.gateFailCount),
    gateFailures,
    failureReasons: (input.failureReasons ?? []).map(safeReason).filter(Boolean).slice(0, 8),
    totalScore: safeInteger(input.totalScore),
    machineReadable:
      typeof input.machineReadable === "boolean" ? input.machineReadable : null,
    machineContract: input.machineContract?.trim().slice(0, 40) || null,
    decision: input.decision?.trim().slice(0, 80) || null,
    draftCharacterLength: draft.length,
    hasKeyTakeaways: hasSection(draft, ["Key Takeaways", "Điểm chính", "Tóm tắt chính"]),
    hasDiscussion: hasSection(draft, ["Discussion", "Thảo luận"]),
    hasReferences: hasSection(draft, ["References", "Tài liệu tham khảo", "Nguồn"]),
    maxTokens: safeInteger(input.maxTokens),
    llmMs: safeInteger(input.llmMs),
    errorClass: input.errorClass ?? null,
    result: input.result,
    deploymentVersion: deployment.commitSha,
    aiTfesVersion: activeAiTfesVersion(),
    aiTfesConfig: {
      bestCandidateLock:
        PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.enabled,
      bestCandidateEpsilon:
        PIPELINE_CONFIG.aiTfesV2.bestCandidateLock.epsilon,
      falseFinalMinorGuard:
        PIPELINE_CONFIG.aiTfesV2.falseFinalMinorGuard.enabled,
      minorPreservePrompt:
        PIPELINE_CONFIG.aiTfesV2.minorPreservePrompt.enabled,
      regressionAutoAckBrake:
        PIPELINE_CONFIG.aiTfesV2.regressionAutoAckBrake.enabled,
      promptArchitecture:
        PIPELINE_CONFIG.aiTfesV2.promptArchitecture.enabled,
    },
    ...(input.fact ? { fact: input.fact } : {}),
    ...(input.convergence ? { convergence: input.convergence } : {}),
    ...(input.finalMinorGuard ? { finalMinorGuard: input.finalMinorGuard } : {}),
    ...(input.minorPreserve ? { minorPreserve: input.minorPreserve } : {}),
    ...(input.autoAckBrake ? { autoAckBrake: input.autoAckBrake } : {}),
    ...(input.prompt ? { prompt: input.prompt } : {}),
  };
}
