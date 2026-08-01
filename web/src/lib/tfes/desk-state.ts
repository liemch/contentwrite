export type FactHumanDisposition = "fixed" | "accept" | "pending";

export type FactClaimState = {
  id: string;
  humanDisposition: FactHumanDisposition;
  note?: string;
};

export type DeskState = {
  factClaims?: FactClaimState[];
  editNote?: string;
  editedAt?: string;
  factAckAt?: string;
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
