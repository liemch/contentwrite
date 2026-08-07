/**
 * Machine gate cho bước 8 (Editorial Review) — align gần bar 9b
 * để bài yếu không lọt thẳng Fact → Final Verification.
 */
import { WorkflowState } from "@/generated/prisma/client";
import { TFES_CONTRACT } from "@/lib/tfes/contract";
import { parseEditorialGateFailures } from "@/lib/tfes/editorial-checklist";
import { parseMarkedPromptJson } from "@/lib/tfes/prompt-registry";
import type {
  EditorialDefectV2,
  EditorialGateV2,
} from "@/lib/tfes/prompts-v2";

export const EDITORIAL_REVIEW_MACHINE_KEYS = [
  "PROVISIONAL_TOTAL_SCORE",
  "PROVISIONAL_INSIGHT_SCORE",
  "GATES_G1_G8",
  "EDITORIAL_DECISION",
] as const;

export const LEGACY_EDITORIAL_REVIEW_MACHINE_KEYS = [
  "FINAL_TOTAL_SCORE",
  "FINAL_INSIGHT_SCORE",
  "GATES_G1_G8",
  "FINAL_DECISION",
] as const;

export type EditorialReviewInspection = {
  totalScore: number | null;
  insightScore: number | null;
  gatesPassed: boolean;
  gateFailCount: number;
  decision: string;
  machineReadable: boolean;
  machineContract: "v2" | "canonical" | "legacy" | "invalid";
  gates: EditorialGateV2[];
  gateFailures: string[];
  defects: EditorialDefectV2[];
  requiredActions: string[];
  /** State sau khi override theo điểm (nếu model tự khai EDITORIAL_REVIEWED oan). */
  resolvedState: WorkflowState;
  failureReasons: string[];
};

const EDITORIAL_DECISIONS = [
  "EDITORIAL_REVIEWED",
  "MINOR_REVISION_REQUIRED",
  "MAJOR_REVISION_REQUIRED",
  "REWRITE_REQUIRED",
] as const;

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 32)
    : [];
}

function parseDefects(value: unknown): EditorialDefectV2[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const defect = item as Record<string, unknown>;
    const location =
      defect.location && typeof defect.location === "object"
        ? (defect.location as Record<string, unknown>)
        : {};
    const severity = defect.severity;
    if (
      typeof defect.defectId !== "string" ||
      typeof defect.type !== "string" ||
      !["MINOR", "MAJOR", "REWRITE"].includes(String(severity)) ||
      typeof location.sectionId !== "string" ||
      typeof defect.diagnosis !== "string" ||
      typeof defect.requiredOutcome !== "string" ||
      typeof defect.blocking !== "boolean"
    ) {
      return [];
    }
    return [{
      defectId: defect.defectId.slice(0, 80),
      type: defect.type.slice(0, 80),
      severity: severity as EditorialDefectV2["severity"],
      location: {
        sectionId: location.sectionId.slice(0, 120),
        ...(typeof location.anchorStart === "string"
          ? { anchorStart: location.anchorStart.slice(0, 200) }
          : {}),
        ...(typeof location.anchorEnd === "string"
          ? { anchorEnd: location.anchorEnd.slice(0, 200) }
          : {}),
      },
      diagnosis: defect.diagnosis.slice(0, 500),
      requiredOutcome: defect.requiredOutcome.slice(0, 500),
      allowedMutations: stringArray(defect.allowedMutations),
      evidenceRefs: stringArray(defect.evidenceRefs),
      blocking: defect.blocking,
    }];
  }).slice(0, 32);
}

function parseV2Editorial(review: string): {
  totalScore: number | null;
  insightScore: number | null;
  decision: string;
  gates: EditorialGateV2[];
  defects: EditorialDefectV2[];
  requiredActions: string[];
  contractPresent: boolean;
} {
  const json = parseMarkedPromptJson(review, "EDITORIAL_DIAGNOSIS_JSON:");
  if (!json) {
    return {
      totalScore: null,
      insightScore: null,
      decision: "",
      gates: [],
      defects: [],
      requiredActions: [],
      contractPresent: false,
    };
  }
  const gates = Array.isArray(json.gates)
    ? json.gates.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const gate = item as Record<string, unknown>;
        const id = typeof gate.id === "string" ? gate.id.toUpperCase() : "";
        const status =
          gate.status === "PASSED" || gate.status === "FAILED" ? gate.status : "";
        if (!/^G[1-8]$/.test(id) || !status) return [];
        return [{
          id,
          status,
          ...(typeof gate.reason === "string"
            ? { reason: gate.reason.slice(0, 300) }
            : {}),
        } satisfies EditorialGateV2];
      })
    : [];
  return {
    totalScore:
      typeof json.totalScore === "number" && Number.isFinite(json.totalScore)
        ? Math.round(json.totalScore)
        : null,
    insightScore:
      typeof json.insightScore === "number" && Number.isFinite(json.insightScore)
        ? Math.round(json.insightScore)
        : null,
    decision:
      typeof json.decision === "string" &&
      EDITORIAL_DECISIONS.includes(
        json.decision as (typeof EDITORIAL_DECISIONS)[number],
      )
        ? json.decision
        : "",
    gates,
    defects: parseDefects(json.defects),
    requiredActions: stringArray(json.requiredActions),
    contractPresent: json.contractVersion === "editorial-diagnosis.v2",
  };
}

export function extractEditorialDiagnosisV2(
  review: string | null | undefined,
): Pick<EditorialReviewInspection, "defects" | "requiredActions" | "gates"> | null {
  const parsed = parseV2Editorial(review ?? "");
  return parsed.contractPresent
    ? {
        defects: parsed.defects,
        requiredActions: parsed.requiredActions,
        gates: parsed.gates,
      }
    : null;
}

function machineNumber(text: string, key: string): number | null {
  let found: number | null = null;
  for (const candidate of text.split(/\r?\n/)) {
    const normalized = candidate.replace(/[*`]/g, "");
    const match = normalized.match(new RegExp(`^\\s*${key}\\s*[:：=]\\s*(\\d{1,3})\\s*$`, "i"));
    if (match) found = Number(match[1]);
  }
  return found;
}

function machineEnum(text: string, key: string, values: readonly string[]): string {
  let found = "";
  for (const candidate of text.split(/\r?\n/)) {
    const normalized = candidate.replace(/[*`]/g, "");
    const match = normalized.match(
      new RegExp(`^\\s*${key}\\s*[:：=]\\s*([A-Z_]+)\\s*$`, "i"),
    );
    if (!match) continue;
    const value = match[1].toUpperCase();
    if (values.includes(value)) found = value;
  }
  return found;
}

/** Đếm G1–G8 / N* bị đánh Fail trong checklist. */
export function countEditorialGateFails(review: string): number {
  return parseEditorialGateFailures(review).length;
}

function stateFromEnum(decision: string): WorkflowState | null {
  if (decision === "REWRITE_REQUIRED") return WorkflowState.REWRITE_REQUIRED;
  if (decision === "MAJOR_REVISION_REQUIRED") {
    return WorkflowState.MAJOR_REVISION_REQUIRED;
  }
  if (decision === "MINOR_REVISION_REQUIRED") {
    return WorkflowState.MINOR_REVISION_REQUIRED;
  }
  if (decision === "EDITORIAL_REVIEWED") return WorkflowState.EDITORIAL_REVIEWED;
  return null;
}

function stateFromScores(
  total: number | null,
  insight: number | null,
  gatesPassed: boolean,
  gateFails: number,
): WorkflowState {
  const minTotal = TFES_CONTRACT.editorialReview.minimumTotalScore;
  const minInsight = TFES_CONTRACT.editorialReview.minimumInsightScore;
  if (
    (insight !== null && insight < minInsight) ||
    (total !== null && total < 75)
  ) {
    return WorkflowState.REWRITE_REQUIRED;
  }
  if (total !== null && total < 85) return WorkflowState.MAJOR_REVISION_REQUIRED;
  if (
    !gatesPassed ||
    gateFails > 0 ||
    (total !== null && total < minTotal) ||
    (insight !== null && insight < minInsight)
  ) {
    return WorkflowState.MINOR_REVISION_REQUIRED;
  }
  return WorkflowState.EDITORIAL_REVIEWED;
}

/**
 * Parse machine lines + checklist Fail; ép EDITORIAL_REVIEWED chỉ khi gần bar 9b.
 */
export function inspectEditorialReview(
  review: string | null | undefined,
): EditorialReviewInspection {
  const body = review ?? "";
  const v2 = parseV2Editorial(body);
  const canonicalTotal = machineNumber(body, "PROVISIONAL_TOTAL_SCORE");
  const canonicalInsight = machineNumber(body, "PROVISIONAL_INSIGHT_SCORE");
  const canonicalDecision = machineEnum(
    body,
    "EDITORIAL_DECISION",
    EDITORIAL_DECISIONS,
  );
  const hasCanonical =
    canonicalTotal !== null || canonicalInsight !== null || Boolean(canonicalDecision);
  const machineContract: EditorialReviewInspection["machineContract"] = hasCanonical
    ? "canonical"
    : v2.contractPresent
      ? "v2"
    : machineNumber(body, "FINAL_TOTAL_SCORE") !== null ||
        machineNumber(body, "FINAL_INSIGHT_SCORE") !== null ||
        Boolean(machineEnum(body, "FINAL_DECISION", [
          "EDITORIAL_REVIEWED",
          "FINAL_REVIEWED",
          "MINOR_REVISION_REQUIRED",
          "MAJOR_REVISION_REQUIRED",
          "REWRITE_REQUIRED",
        ]))
      ? "legacy"
      : "invalid";
  const totalScore =
    machineContract === "v2"
      ? v2.totalScore
      : machineContract === "canonical"
      ? canonicalTotal
      : machineNumber(body, "FINAL_TOTAL_SCORE");
  const insightScore =
    machineContract === "v2"
      ? v2.insightScore
      : machineContract === "canonical"
      ? canonicalInsight
      : machineNumber(body, "FINAL_INSIGHT_SCORE");
  const gateIds = new Set(v2.gates.map((gate) => gate.id));
  const v2GatesComplete =
    v2.gates.length === 8 &&
    gateIds.size === 8 &&
    Array.from({ length: 8 }, (_, index) => `G${index + 1}`).every((id) =>
      gateIds.has(id),
    );
  const v2GateFailures = v2.gates
    .filter((gate) => gate.status === "FAILED")
    .map((gate) => gate.id);
  const gatesStatus =
    machineContract === "v2"
      ? v2GatesComplete
        ? v2GateFailures.length === 0
          ? "PASSED"
          : "FAILED"
        : ""
      : machineEnum(body, "GATES_G1_G8", ["PASSED", "FAILED"]);
  const decision =
    machineContract === "v2"
      ? v2.decision
      : machineContract === "canonical"
      ? canonicalDecision
      : machineEnum(body, "FINAL_DECISION", [
          "EDITORIAL_REVIEWED",
          "FINAL_REVIEWED",
          "MINOR_REVISION_REQUIRED",
          "MAJOR_REVISION_REQUIRED",
          "REWRITE_REQUIRED",
        ]);

  const legacyGateFailures = parseEditorialGateFailures(body).map(
    (failure) => failure.code,
  );
  const gateFailures =
    machineContract === "v2" ? v2GateFailures : legacyGateFailures;
  const gateFailCount = gateFailures.length;
  const gatesPassed =
    gatesStatus === "PASSED" || (gatesStatus === "" && gateFailCount === 0);
  const normalizedDecision =
    decision === "FINAL_REVIEWED" ? "EDITORIAL_REVIEWED" : decision;

  const failureReasons: string[] = [];
  const expectedTotal =
    machineContract === "v2"
      ? "totalScore"
      : machineContract === "legacy"
        ? "FINAL_TOTAL_SCORE"
        : "PROVISIONAL_TOTAL_SCORE";
  const expectedInsight =
    machineContract === "v2"
      ? "insightScore"
      : machineContract === "legacy"
        ? "FINAL_INSIGHT_SCORE"
        : "PROVISIONAL_INSIGHT_SCORE";
  const expectedDecision =
    machineContract === "v2"
      ? "decision"
      : machineContract === "legacy"
        ? "FINAL_DECISION"
        : "EDITORIAL_DECISION";
  if (totalScore === null) failureReasons.push(`thiếu ${expectedTotal}`);
  if (insightScore === null) failureReasons.push(`thiếu ${expectedInsight}`);
  if (!gatesStatus && gateFailCount === 0) {
    if (machineContract === "v2") {
      failureReasons.push("gates v2 phải chứa đúng G1–G8");
    }
  } else if (gatesStatus === "FAILED" || gateFailCount > 0) {
    failureReasons.push(
      gateFailCount > 0
        ? `${gateFailCount} gate Fail trên checklist`
        : "G1–G8 FAILED",
    );
  }
  if (!normalizedDecision) {
    failureReasons.push(`thiếu ${expectedDecision} hợp lệ`);
  }

  const fieldsPresent =
    totalScore !== null &&
    insightScore !== null &&
    Boolean(gatesStatus) &&
    Boolean(normalizedDecision);
  const scoresInRange =
    totalScore !== null &&
    totalScore >= 0 &&
    totalScore <= 100 &&
    insightScore !== null &&
    insightScore >= 0 &&
    insightScore <= 30;
  const degenerate = totalScore === 0 && insightScore === 0;
  const machineReadable = fieldsPresent && scoresInRange && !degenerate;

  let resolvedState: WorkflowState;
  if (!machineReadable) {
    // Không quét enum trên toàn văn: template/giải thích có thể liệt kê REWRITE_REQUIRED.
    // Malformed output không được PASS và cũng không được tự nâng thành REWRITE.
    resolvedState = WorkflowState.MINOR_REVISION_REQUIRED;
    failureReasons.push("machine output Editorial Review không hợp lệ — cần chấm lại");
  } else {
    const fromScores = stateFromScores(
      totalScore,
      insightScore,
      gatesPassed && gateFailCount === 0,
      gateFailCount,
    );
    const fromEnum = stateFromEnum(normalizedDecision);
    // Lấy mức nghiêm hơn giữa model và điểm
    const rank = (s: WorkflowState) =>
      s === WorkflowState.REWRITE_REQUIRED
        ? 3
        : s === WorkflowState.MAJOR_REVISION_REQUIRED
          ? 2
          : s === WorkflowState.MINOR_REVISION_REQUIRED
            ? 1
            : 0;
    resolvedState =
      fromEnum && rank(fromEnum) > rank(fromScores) ? fromEnum : fromScores;

    if (
      normalizedDecision === "EDITORIAL_REVIEWED" &&
      resolvedState !== WorkflowState.EDITORIAL_REVIEWED
    ) {
      failureReasons.push(
        `model khai EDITORIAL_REVIEWED nhưng điểm/gate chưa đủ (total=${totalScore}, insight=${insightScore})`,
      );
    }
  }

  return {
    totalScore,
    insightScore,
    gatesPassed: gatesPassed && gateFailCount === 0,
    gateFailCount,
    decision: normalizedDecision,
    machineReadable,
    machineContract,
    gates: machineContract === "v2" ? v2.gates : [],
    gateFailures,
    defects: machineContract === "v2" ? v2.defects : [],
    requiredActions: machineContract === "v2" ? v2.requiredActions : [],
    resolvedState,
    failureReasons,
  };
}
