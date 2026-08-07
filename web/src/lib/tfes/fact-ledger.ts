import type { FactClaimState, FactHumanDisposition } from "@/lib/tfes/desk-state";

export type FactClaim = {
  id: string;
  index: number;
  claim: string;
  kind: string;
  source: string;
  aiVerdict: string;
  action: string;
};

const BAD_VERDICT =
  /\b(Unsupported|Contradicted|Failed|Major\s*Issue|FAIL)\b/i;

export function isBadAiVerdict(verdict: string): boolean {
  return BAD_VERDICT.test(verdict);
}

/**
 * Claim chặn publish / chặn Fact PASSED máy:
 * Unsupported/Contradicted/Failed, hoặc Unverifiable không gắn Opinion/Prediction.
 */
export function isBlockingFactClaim(claim: FactClaim): boolean {
  if (isBadAiVerdict(claim.aiVerdict)) return true;
  if (!/Unverifiable/i.test(claim.aiVerdict)) return false;
  return !/Opinion|Prediction/i.test(`${claim.kind} ${claim.action}`);
}

export function countBlockingFactClaims(
  factCheck: string | null | undefined,
): number {
  return parseFactClaims(factCheck).filter(isBlockingFactClaim).length;
}

function slugClaim(text: string, index: number): string {
  const base = text
    .toLowerCase()
    .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+/gi, "-")
    .replace(/-+/g, "-")
    .slice(0, 40);
  return `c${index}-${base || "claim"}`;
}

/** Parse Fact-Check Ledger (bảng markdown hoặc dòng Claim). */
export function parseFactClaims(factCheck: string | null | undefined): FactClaim[] {
  const raw = (factCheck ?? "").trim();
  if (!raw) return [];

  const claims: FactClaim[] = [];
  const lines = raw.split(/\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("|")) continue;
    if (/^\|\s*-+/.test(t) || /Claim ID/i.test(t) || /Khẳng định/i.test(t)) continue;

    const cells = t
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

    if (cells.length < 5) continue;
    const isV16 = cells.length >= 10 && /^C[-_ ]?\d+/i.test(cells[0]);
    const index = Number(cells[0].match(/\d+/)?.[0]) || claims.length + 1;
    const claim = isV16 ? cells[2] : cells[1];
    if (!claim || claim.length < 8) continue;

    claims.push({
      id: slugClaim(claim, index),
      index,
      claim,
      kind: cells[isV16 ? 3 : 2] || "",
      source: cells[isV16 ? 5 : 3] || "",
      aiVerdict: cells[isV16 ? 8 : 4] || "",
      action: cells[isV16 ? 10 : 5] || "",
    });
  }

  if (claims.length === 0) {
    // Fallback: bullet "Claim: … Verdict: …"
    const re =
      /(?:^|\n)\s*(?:[-*]|\d+\.)\s*(?:Claim|Khẳng định)?\s*[:：]?\s*(.+?)(?:\n|$)/gi;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(raw)) && i < 20) {
      const claim = m[1].trim().slice(0, 200);
      if (claim.length < 12) continue;
      i += 1;
      claims.push({
        id: slugClaim(claim, i),
        index: i,
        claim,
        kind: "",
        source: "",
        aiVerdict: /Unsupported|Contradicted|FAIL/i.test(raw.slice(m.index, m.index + 200))
          ? "Unsupported"
          : "See ledger",
        action: "",
      });
    }
  }

  return claims.slice(0, 40);
}

export function unresolvedBadClaims(
  claims: FactClaim[],
  human: FactClaimState[] | undefined,
): FactClaim[] {
  const byId = new Map((human ?? []).map((h) => [h.id, h]));
  return claims.filter((c) => {
    if (!isBadAiVerdict(c.aiVerdict)) return false;
    const h = byId.get(c.id);
    const d: FactHumanDisposition = h?.humanDisposition ?? "pending";
    return d === "pending";
  });
}

export function verificationStatus(factCheck: string | null | undefined): string {
  const lines = (factCheck ?? "")
    .split(/\r?\n/)
    .filter((candidate) => /Verification[\s_-]*Status/i.test(candidate));
  const resolved = lines.flatMap((line) => {
    const statuses = Array.from(
      line.matchAll(/\b(PASSED|MINOR[\s_-]*ISSUE|MAJOR[\s_-]*ISSUE|FAILED)\b/gi),
      (match) => match[1].toUpperCase().replace(/[\s-]+/g, "_"),
    );
    const uniqueOnLine = [...new Set(statuses)];
    return uniqueOnLine.length === 1 ? uniqueOnLine : [];
  });
  const unique = [...new Set(resolved)];

  // Bỏ qua dòng placeholder chứa nhiều enum; các dòng kết quả phải nhất quán.
  return unique.length === 1 ? unique[0] : "";
}

export type FactCheckSummary = {
  /** Parsed Verification Status, or null when the ledger is unreadable. */
  verdict: string | null;
  claimCount: number;
  blockingClaimCount: number;
  unsupportedClaimCount: number;
  unverifiableClaimCount: number;
  claimsWithoutSourceCount: number;
  /** Parser could not read a status line or any claim row. */
  malformedOutput: boolean;
};

/**
 * Deterministic Fact Check shape for telemetry. Counts only; never claim text,
 * source content or prompts. Citation-mismatch has no parser today, so it is not reported.
 */
export function summarizeFactCheck(
  factCheck: string | null | undefined,
): FactCheckSummary {
  const claims = parseFactClaims(factCheck);
  const status = verificationStatus(factCheck);
  const unsupported = claims.filter((claim) => isBadAiVerdict(claim.aiVerdict));
  const unverifiable = claims.filter(
    (claim) => !isBadAiVerdict(claim.aiVerdict) && isBlockingFactClaim(claim),
  );
  return {
    verdict: status || null,
    claimCount: claims.length,
    blockingClaimCount: claims.filter(isBlockingFactClaim).length,
    unsupportedClaimCount: unsupported.length,
    unverifiableClaimCount: unverifiable.length,
    claimsWithoutSourceCount: claims.filter((claim) => !claim.source.trim()).length,
    malformedOutput: !status || claims.length === 0,
  };
}

export const MAX_FACT_REMEDIATION_RETRIES = 3;

export function isFactRemediationExhausted(
  errorMessage: string | null | undefined,
): boolean {
  return /Fact Check chưa đạt sau \d+ lần remediation/i.test(errorMessage ?? "");
}
