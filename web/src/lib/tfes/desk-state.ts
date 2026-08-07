export type FactHumanDisposition = "fixed" | "accept" | "pending";

export type FactClaimState = {
  id: string;
  humanDisposition: FactHumanDisposition;
  note?: string;
};

export type EditorValidationFeedback = {
  articleId: string;
  userId: string;
  finalUsability: number;
  manualEditEffort: number;
  confusingStep: string;
  errorHelpfulness: number;
  reuseIntent: number;
  note?: string;
  recordedAt: string;
};

export type DeskState = {
  factClaims?: FactClaimState[];
  editNote?: string;
  editedAt?: string;
  factAckAt?: string;
  validationFeedback?: EditorValidationFeedback;
};

export function parseDeskJson(raw: string | null | undefined): DeskState {
  if (!raw?.trim()) return {};
  try {
    const data = JSON.parse(raw) as DeskState;
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

export function serializeDeskJson(state: DeskState): string {
  return JSON.stringify(state);
}

export function mergeDeskJson(
  raw: string | null | undefined,
  patch: Partial<DeskState>,
): string {
  const current = parseDeskJson(raw);
  return serializeDeskJson({ ...current, ...patch });
}

function rating(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${label} phải là số nguyên từ 1 đến 5`);
  }
  return value;
}

export function buildEditorValidationFeedback(input: {
  articleId: string;
  userId: string;
  finalUsability: number;
  manualEditEffort: number;
  confusingStep: string;
  errorHelpfulness: number;
  reuseIntent: number;
  note?: string;
  recordedAt?: Date;
}): EditorValidationFeedback {
  return {
    articleId: input.articleId,
    userId: input.userId,
    finalUsability: rating(input.finalUsability, "Bài cuối có dùng được không"),
    manualEditEffort: rating(input.manualEditEffort, "Mức sửa tay"),
    confusingStep: input.confusingStep.trim().slice(0, 500),
    errorHelpfulness: rating(input.errorHelpfulness, "Mức hữu ích của thông báo lỗi"),
    reuseIntent: rating(input.reuseIntent, "Ý định dùng lại"),
    note: input.note?.trim().slice(0, 1_000) || undefined,
    recordedAt: (input.recordedAt ?? new Date()).toISOString(),
  };
}
