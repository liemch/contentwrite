import { countBlockingFactClaims, verificationStatus } from "@/lib/tfes/fact-ledger";
import { TFES_CONTRACT } from "@/lib/tfes/contract";
import {
  extractMarkedJson,
  type MarkedJsonReason,
} from "@/lib/tfes/machine-contract";

export type FinalVerification = {
  totalScore: number | null;
  insightScore: number | null;
  gatesPassed: boolean;
  factPassed: boolean;
  openActions: number | null;
  decision:
    | "FINAL_REVIEWED"
    | "MINOR_REVISION_REQUIRED"
    | "MAJOR_REVISION_REQUIRED"
    | "REWRITE_REQUIRED"
    | null;
  blockingClaims: number;
  machineReadable: boolean;
  machineContract: "final-v1" | "lock-v2" | "invalid";
  failureReasons: string[];
  publishReady: boolean;
  /** LLM dump 0/0 thay vì chấm thật — không được đưa vào vòng REWRITE. */
  degenerateScores: boolean;
  lockDecision: string | null;
  blockingResiduals: string[];
  openRequiredActions: string[];
  unresolvedDefectIds: string[];
  optionalPolishActions: string[];
  regressionDetected: boolean | null;
  malformedOutput: boolean;
};

const LOCK_DECISIONS = [
  "LOCKED",
  "PATCH_REQUIRED",
  "FACT_PATCH_REQUIRED",
  "REWRITE_ESCALATION_REQUESTED",
  "CONTEXT_INCOMPLETE",
] as const;

const LOCK_MARKER = "LOCK_DECISION_JSON:";
const LOCK_CONTRACT_VERSION = "lock-decision.v2";

/**
 * Marker bị quên là lỗi hay gặp nhất của bước 9b; object vẫn dùng được nếu
 * contractVersion đúng, nên vớt trước khi tuyên bố sai định dạng.
 */
function readLockDecisionJson(body: string): {
  json: Record<string, unknown> | null;
  reason: MarkedJsonReason;
} {
  const marked = extractMarkedJson(body, LOCK_MARKER);
  if (marked.json || marked.reason !== "marker-missing") {
    return { json: marked.json, reason: marked.reason };
  }

  const contractAt = body.indexOf(LOCK_CONTRACT_VERSION);
  if (contractAt < 0) return { json: null, reason: "marker-missing" };
  const objectStart = body.lastIndexOf("{", contractAt);
  if (objectStart < 0) return { json: null, reason: "marker-missing" };

  const salvaged = extractMarkedJson(
    `${LOCK_MARKER}${body.slice(objectStart)}`,
    LOCK_MARKER,
  );
  return { json: salvaged.json, reason: salvaged.json ? "ok" : salvaged.reason };
}

function lockContractFailureReason(reason: MarkedJsonReason): string {
  switch (reason) {
    case "json-truncated":
      return "Lock Verifier v2 bị cắt giữa chừng (LOCK_DECISION_JSON chưa đóng)";
    case "json-unparseable":
      return "LOCK_DECISION_JSON không parse được";
    case "json-missing":
      return "LOCK_DECISION_JSON có marker nhưng thiếu object";
    default:
      return "thiếu LOCK_DECISION_JSON (prompt lock-verifier@2.0 yêu cầu khối JSON này)";
  }
}

/** Output 9b không đọc được theo contract v2 — luôn route format retry, không phải verdict. */
function unreadableLockVerification(
  factCheck: string | null | undefined,
  reason: MarkedJsonReason,
): FinalVerification {
  return {
    totalScore: null,
    insightScore: null,
    gatesPassed: false,
    factPassed: /^PASSED$/i.test(verificationStatus(factCheck)),
    openActions: null,
    decision: null,
    blockingClaims: countBlockingFactClaims(factCheck),
    machineReadable: false,
    machineContract: "invalid",
    failureReasons: [lockContractFailureReason(reason)],
    publishReady: false,
    degenerateScores: false,
    lockDecision: null,
    blockingResiduals: [],
    openRequiredActions: [],
    unresolvedDefectIds: [],
    optionalPolishActions: [],
    regressionDetected: null,
    malformedOutput: true,
  };
}

function lockStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.filter((item): item is string => typeof item === "string");
  return values.length === value.length ? values.slice(0, 64) : null;
}

function inspectLockVerificationV2(
  body: string,
  factCheck: string | null | undefined,
  expectedContract?: "lock-v2" | "final-v1",
): FinalVerification | null {
  const { json, reason } = readLockDecisionJson(body);
  if (!json) {
    // Chỉ khi 9b chạy prompt v2 mới được kết luận "sai contract v2"; auto-detect
    // vẫn phải rơi về final-v1 để không phá đường legacy.
    return expectedContract === "lock-v2"
      ? unreadableLockVerification(factCheck, reason)
      : null;
  }
  const lockDecision =
    typeof json.lockDecision === "string" &&
    LOCK_DECISIONS.includes(json.lockDecision as (typeof LOCK_DECISIONS)[number])
      ? json.lockDecision
      : null;
  const factLockStatus =
    json.factLockStatus === "PASSED" || json.factLockStatus === "FAILED"
      ? json.factLockStatus
      : null;
  const insightFloorStatus =
    json.insightFloorStatus === "PASSED" || json.insightFloorStatus === "FAILED"
      ? json.insightFloorStatus
      : null;
  const blockingResiduals = lockStringArray(json.blockingResiduals);
  const openRequiredActions = lockStringArray(json.openRequiredActions);
  const unresolvedDefectIds = lockStringArray(json.unresolvedDefectIds);
  const optionalPolishActions = lockStringArray(json.optionalPolishActions);
  const regressionDetected =
    typeof json.regressionDetected === "boolean"
      ? json.regressionDetected
      : null;
  const factPassed = /^PASSED$/i.test(verificationStatus(factCheck));
  const blockingClaims = countBlockingFactClaims(factCheck);
  const fieldsPresent =
    json.contractVersion === LOCK_CONTRACT_VERSION &&
    lockDecision !== null &&
    factLockStatus !== null &&
    insightFloorStatus !== null &&
    blockingResiduals !== null &&
    openRequiredActions !== null &&
    unresolvedDefectIds !== null &&
    optionalPolishActions !== null &&
    regressionDetected !== null;
  const failureReasons: string[] = [];
  if (!fieldsPresent) {
    failureReasons.push("Lock Verifier v2 thiếu field machine-readable bắt buộc");
  }
  if (!factPassed || factLockStatus !== "PASSED") {
    failureReasons.push("Fact lock chưa PASSED");
  }
  if (blockingClaims > 0) failureReasons.push(`${blockingClaims} blocking claim`);
  if ((blockingResiduals?.length ?? 0) > 0) {
    failureReasons.push(`${blockingResiduals?.length ?? 0} blocking residual`);
  }
  if ((openRequiredActions?.length ?? 0) > 0) {
    failureReasons.push(`${openRequiredActions?.length ?? 0} required action còn mở`);
  }
  if ((unresolvedDefectIds?.length ?? 0) > 0) {
    failureReasons.push(`${unresolvedDefectIds?.length ?? 0} blocking defect chưa đóng`);
  }
  if (insightFloorStatus !== "PASSED") failureReasons.push("Insight floor chưa đạt");
  if (regressionDetected) failureReasons.push("Candidate regression detected");
  if (lockDecision && lockDecision !== "LOCKED") {
    failureReasons.push(`Lock decision=${lockDecision}`);
  }
  const machineReadable = fieldsPresent;
  const publishReady = Boolean(
    machineReadable &&
      lockDecision === "LOCKED" &&
      factPassed &&
      factLockStatus === "PASSED" &&
      insightFloorStatus === "PASSED" &&
      blockingClaims === 0 &&
      blockingResiduals?.length === 0 &&
      openRequiredActions?.length === 0 &&
      unresolvedDefectIds?.length === 0 &&
      regressionDetected === false,
  );
  const mappedDecision: FinalVerification["decision"] =
    lockDecision === "LOCKED"
      ? "FINAL_REVIEWED"
      : lockDecision === "REWRITE_ESCALATION_REQUESTED"
        ? "REWRITE_REQUIRED"
        : lockDecision === "FACT_PATCH_REQUIRED"
          ? "MAJOR_REVISION_REQUIRED"
          : lockDecision === "CONTEXT_INCOMPLETE"
            ? null
            : lockDecision
              ? "MINOR_REVISION_REQUIRED"
              : null;
  return {
    totalScore: null,
    insightScore: null,
    gatesPassed: true,
    factPassed,
    openActions: openRequiredActions?.length ?? null,
    decision: mappedDecision,
    blockingClaims,
    machineReadable,
    machineContract: machineReadable ? "lock-v2" : "invalid",
    failureReasons,
    publishReady,
    degenerateScores: false,
    lockDecision,
    blockingResiduals: blockingResiduals ?? [],
    openRequiredActions: openRequiredActions ?? [],
    unresolvedDefectIds: unresolvedDefectIds ?? [],
    optionalPolishActions: optionalPolishActions ?? [],
    regressionDetected,
    malformedOutput: !machineReadable,
  };
}

/**
 * Điểm thoái hoá: cả TOTAL và Insight = 0.
 * Sau Fact Check PASSED gần như không bao giờ hợp lệ — thường là LLM ghi placeholder.
 */
export function isDegenerateFinalScores(
  totalScore: number | null,
  insightScore: number | null,
): boolean {
  return totalScore === 0 && insightScore === 0;
}

/** Prefer last matching line — machine block nằm cuối output. */
function numberAfter(text: string, label: RegExp): number | null {
  let found: number | null = null;
  for (const candidate of text.split(/\r?\n/)) {
    if (!new RegExp(label.source, "i").test(candidate)) continue;
    const normalized = candidate.replace(/[*`]/g, "");
    const match = normalized.match(
      new RegExp(`${label.source}\\s*[:：=]\\s*(\\d{1,3})`, "i"),
    );
    if (match) found = Number(match[1]);
  }
  return found;
}

function machineEnum(text: string, label: string, values: string[]): string {
  let found = "";
  for (const candidate of text.split(/\r?\n/)) {
    if (!candidate.toUpperCase().includes(label)) continue;
    const matches = values.filter((value) =>
      new RegExp(`\\b${value}\\b`, "i").test(candidate),
    );
    if (matches.length === 1) found = matches[0];
  }
  return found;
}

/**
 * Khi decision ≠ band điểm (vd. MAJOR nhưng score 0), coi là chưa machine-readable
 * để retry 9b — tránh route REWRITE oan.
 */
function decisionConsistentWithScores(
  decision: string,
  totalScore: number | null,
  insightScore: number | null,
): boolean {
  if (!decision || totalScore === null || insightScore === null) return true;
  if (isDegenerateFinalScores(totalScore, insightScore)) return false;

  switch (decision) {
    case "FINAL_REVIEWED":
      // Cho phép grace band (≥ nearMissAcceptFloor) khi model chấm FINAL_REVIEWED sát ngưỡng.
      return (
        totalScore >= TFES_CONTRACT.finalReview.nearMissAcceptFloor &&
        insightScore >= TFES_CONTRACT.finalReview.minimumInsightScore
      );
    case "MINOR_REVISION_REQUIRED":
      // 85–89: lỗi nhỏ không đổi luận điểm (grace pass xử lý riêng khi ≥ nearMiss)
      return totalScore >= 85 && totalScore < TFES_CONTRACT.finalReview.minimumTotalScore;
    case "MAJOR_REVISION_REQUIRED":
      return totalScore >= 75 && totalScore < 85;
    case "REWRITE_REQUIRED":
      return (
        totalScore < 75 ||
        insightScore < TFES_CONTRACT.finalReview.minimumInsightScore
      );
    default:
      return true;
  }
}

export function inspectFinalVerification(
  review: string | null | undefined,
  factCheck: string | null | undefined,
  options?: { expectedContract?: "lock-v2" | "final-v1" },
): FinalVerification {
  const body = review ?? "";
  const v2 = inspectLockVerificationV2(
    body,
    factCheck,
    options?.expectedContract,
  );
  if (v2) return v2;
  const totalScore = numberAfter(body, /FINAL_TOTAL_SCORE/);
  const insightScore = numberAfter(body, /FINAL_INSIGHT_SCORE/);
  const openActions = numberAfter(body, /OPEN_REQUIRED_ACTIONS/);
  const gatesStatus = machineEnum(body, "GATES_G1_G8", ["PASSED", "FAILED"]);
  const decision = machineEnum(body, "FINAL_DECISION", [
    "FINAL_REVIEWED",
    "MINOR_REVISION_REQUIRED",
    "MAJOR_REVISION_REQUIRED",
    "REWRITE_REQUIRED",
  ]);
  const gatesPassed = gatesStatus === "PASSED";
  const factPassed = /^PASSED$/i.test(verificationStatus(factCheck));
  const blockingClaims = countBlockingFactClaims(factCheck);

  const degenerateScores = isDegenerateFinalScores(totalScore, insightScore);
  const decisionOk = decisionConsistentWithScores(decision, totalScore, insightScore);

  const insightOk =
    insightScore !== null &&
    insightScore >= TFES_CONTRACT.finalReview.minimumInsightScore;
  const scoreIdeal =
    totalScore !== null &&
    totalScore >= TFES_CONTRACT.finalReview.minimumTotalScore;
  const scoreNearMiss =
    totalScore !== null &&
    totalScore >= TFES_CONTRACT.finalReview.nearMissAcceptFloor &&
    totalScore < TFES_CONTRACT.finalReview.minimumTotalScore;
  const scoreOk = scoreIdeal || scoreNearMiss;

  const failureReasons: string[] = [];
  if (totalScore === null) failureReasons.push("thiếu FINAL_TOTAL_SCORE");
  else if (degenerateScores) {
    failureReasons.push(
      "điểm thoái hoá TOTAL=0 và INSIGHT=0 (không chấp nhận — phải chấm lại theo rubric)",
    );
  } else if (!scoreOk) {
    failureReasons.push(
      `total ${totalScore}<${TFES_CONTRACT.finalReview.nearMissAcceptFloor}`,
    );
  }
  if (insightScore === null) failureReasons.push("thiếu FINAL_INSIGHT_SCORE");
  else if (!degenerateScores && !insightOk) {
    failureReasons.push(
      `insight ${insightScore}<${TFES_CONTRACT.finalReview.minimumInsightScore}`,
    );
  }
  if (!gatesStatus) failureReasons.push("thiếu GATES_G1_G8");
  else if (!gatesPassed) failureReasons.push("G1–G8 chưa đạt");
  if (!factPassed) failureReasons.push("Fact Check chưa PASSED");
  if (openActions === null) failureReasons.push("thiếu OPEN_REQUIRED_ACTIONS");
  else if (openActions !== 0) failureReasons.push(`${openActions} required action còn mở`);
  if (!decision) {
    failureReasons.push(
      "thiếu FINAL_DECISION hợp lệ (FINAL_REVIEWED|MINOR_REVISION_REQUIRED|MAJOR_REVISION_REQUIRED|REWRITE_REQUIRED — không dùng PUBLISH_READY)",
    );
  } else if (!decisionOk) {
    failureReasons.push(
      `FINAL_DECISION=${decision} không khớp band điểm (total=${totalScore}, insight=${insightScore})`,
    );
  }
  if (blockingClaims > 0) failureReasons.push(`${blockingClaims} blocking claim`);

  const fieldsPresent =
    totalScore !== null &&
    insightScore !== null &&
    openActions !== null &&
    Boolean(gatesStatus) &&
    Boolean(decision);

  // Điểm 0/0 hoặc decision lệch band → coi như sai format, retry 9b (không REWRITE).
  const machineReadable = fieldsPresent && !degenerateScores && decisionOk;

  const coreGatesOk =
    gatesPassed &&
    factPassed &&
    openActions === 0 &&
    blockingClaims === 0 &&
    insightOk &&
    scoreOk;

  // Grace: điểm 87–89 + đủ gate → pass dù LLM ghi MINOR (tránh dừng/remediate oan).
  const publishReady = Boolean(machineReadable && coreGatesOk);

  return {
    totalScore,
    insightScore,
    gatesPassed,
    factPassed,
    openActions,
    decision:
      decision === "FINAL_REVIEWED" ||
      decision === "MINOR_REVISION_REQUIRED" ||
      decision === "MAJOR_REVISION_REQUIRED" ||
      decision === "REWRITE_REQUIRED"
        ? decision
        : null,
    blockingClaims,
    machineReadable,
    machineContract: machineReadable ? "final-v1" : "invalid",
    failureReasons,
    degenerateScores,
    publishReady,
    lockDecision: null,
    blockingResiduals: [],
    openRequiredActions: [],
    unresolvedDefectIds: [],
    optionalPolishActions: [],
    regressionDetected: null,
    malformedOutput: !machineReadable,
  };
}

export function assertFinalVerificationPassed(
  review: string | null | undefined,
  factCheck: string | null | undefined,
): FinalVerification {
  const result = inspectFinalVerification(review, factCheck);
  if (!result.publishReady) {
    throw new Error(
      `Final Verification chưa đạt: total=${result.totalScore ?? "?"}/100, insight=${result.insightScore ?? "?"}/30, G1-G8=${result.gatesPassed ? "PASSED" : "FAILED"}, Fact=${result.factPassed ? "PASSED" : "FAILED"}, open_actions=${result.openActions ?? "?"}`,
    );
  }
  return result;
}
