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
    if (/^\|\s*-+/.test(t) || /\|\s*#\s*\|/i.test(t) || /Khẳng định/i.test(t)) continue;

    const cells = t
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());

    if (cells.length < 5) continue;
    const index = Number(cells[0]) || claims.length + 1;
    const claim = cells[1];
    if (!claim || claim.length < 8) continue;

    claims.push({
      id: slugClaim(claim, index),
      index,
      claim,
      kind: cells[2] || "",
      source: cells[3] || "",
      aiVerdict: cells[4] || "",
      action: cells[5] || "",
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
  const m = (factCheck ?? "").match(
    /Verification\s*Status\s*[:：]\s*`?([^`\n]+)`?/i,
  );
  return (m?.[1] || "").trim();
}
