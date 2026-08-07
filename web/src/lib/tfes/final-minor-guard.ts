export type FinalMinorReasonClass =
  | "craft-only"
  | "blocking-residual"
  | "unknown-residual"
  | "precondition-failed"
  | "already-publishable"
  | "not-minor"
  | "malformed";

export type FinalMinorGuardResult = {
  eligible: boolean;
  suppressed: boolean;
  reasonClass: FinalMinorReasonClass;
  blockingResidualCount: number;
  residualCount: number;
};

const BLOCKING_RESIDUAL =
  /\b(fact|evidence|source|citation|claim|unsupported|contradicted|unverifiable|accuracy|logic|contradiction|thesis|insight|required action|mandatory|safety)\b|bằng chứng|nguồn|trích dẫn|sai sự thật|luận điểm|mâu thuẫn|bắt buộc|hành động còn mở/i;
const CRAFT_RESIDUAL =
  /\b(wording|typo|grammar|punctuation|format(?:ting)?|style|flow|transition|heading|readability|concise|repetition|polish)\b|câu chữ|chính tả|ngữ pháp|dấu câu|định dạng|văn phong|nhịp đọc|chuyển đoạn|tiêu đề|dễ đọc|rút gọn|lặp/i;

function requiredRevisionText(review: string): string | null {
  const lines = review.split(/\r?\n/);
  const start = lines.findIndex((line) => /required revisions?\s*:/i.test(line));
  if (start < 0) return null;
  const first = lines[start].replace(/^.*?required revisions?\s*:\s*/i, "").trim();
  const rest: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (
      /^(FINAL_TOTAL_SCORE|FINAL_INSIGHT_SCORE|GATES_G1_G8|OPEN_REQUIRED_ACTIONS|FINAL_DECISION)\s*:/i.test(
        line.trim(),
      ) ||
      /^#{1,3}\s+/.test(line.trim())
    ) {
      break;
    }
    if (line.trim()) rest.push(line.trim());
  }
  const value = [first, ...rest].filter(Boolean).join("\n").trim();
  return value && !/^(?:<>|none|n\/a|không|0)$/i.test(value) ? value : null;
}

function residualsOf(review: string): string[] {
  const required = requiredRevisionText(review);
  if (!required) return [];
  return required
    .split(/\n|;|(?<=[.!?])\s+/)
    .map((item) => item.replace(/^[-*+\d.)\s]+/, "").trim())
    .filter(Boolean);
}

/** Deterministic fail-safe classifier; unknown residuals are never suppressed. */
export function evaluateFinalMinorGuard(input: {
  enabled: boolean;
  machineReadable: boolean;
  alreadyPublishReady: boolean;
  finalDecision: string | null;
  finalReview: string;
  finalScore: number | null;
  finalInsightScore: number | null;
  finalGatesPassed: boolean;
  factPassed: boolean;
  blockingClaims: number;
  openActions: number | null;
  editorialPassed: boolean;
  editorialScore: number | null;
  editorialGateFailCount: number | null;
  editorialThreshold: number;
  insightFloor: number;
}): FinalMinorGuardResult {
  if (!input.machineReadable) {
    return {
      eligible: false,
      suppressed: false,
      reasonClass: "malformed",
      blockingResidualCount: 0,
      residualCount: 0,
    };
  }
  if (input.finalDecision !== "MINOR_REVISION_REQUIRED") {
    return {
      eligible: false,
      suppressed: false,
      reasonClass: "not-minor",
      blockingResidualCount: 0,
      residualCount: 0,
    };
  }
  if (input.alreadyPublishReady) {
    return {
      eligible: false,
      suppressed: false,
      reasonClass: "already-publishable",
      blockingResidualCount: 0,
      residualCount: 0,
    };
  }

  const qualityPreconditions =
    input.editorialPassed &&
    input.editorialScore !== null &&
    input.editorialScore >= input.editorialThreshold &&
    input.editorialGateFailCount === 0 &&
    input.factPassed &&
    input.finalGatesPassed &&
    input.blockingClaims === 0 &&
    input.openActions === 0 &&
    input.finalInsightScore !== null &&
    input.finalInsightScore >= input.insightFloor &&
    input.finalScore !== null;
  if (!qualityPreconditions) {
    return {
      eligible: false,
      suppressed: false,
      reasonClass: "precondition-failed",
      blockingResidualCount:
        input.blockingClaims + (input.openActions && input.openActions > 0 ? input.openActions : 0),
      residualCount: 0,
    };
  }

  const residuals = residualsOf(input.finalReview);
  if (residuals.length === 0) {
    return {
      eligible: false,
      suppressed: false,
      reasonClass: "unknown-residual",
      blockingResidualCount: 1,
      residualCount: 0,
    };
  }
  const blocking = residuals.filter((residual) => BLOCKING_RESIDUAL.test(residual));
  const unknown = residuals.filter(
    (residual) =>
      !BLOCKING_RESIDUAL.test(residual) && !CRAFT_RESIDUAL.test(residual),
  );
  if (blocking.length > 0) {
    return {
      eligible: false,
      suppressed: false,
      reasonClass: "blocking-residual",
      blockingResidualCount: blocking.length + unknown.length,
      residualCount: residuals.length,
    };
  }
  if (unknown.length > 0) {
    return {
      eligible: false,
      suppressed: false,
      reasonClass: "unknown-residual",
      blockingResidualCount: unknown.length,
      residualCount: residuals.length,
    };
  }
  return {
    eligible: true,
    suppressed: input.enabled,
    reasonClass: "craft-only",
    blockingResidualCount: 0,
    residualCount: residuals.length,
  };
}
