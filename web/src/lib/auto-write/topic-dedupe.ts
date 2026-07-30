/** Chuẩn hoá + phát hiện trùng chủ đề (exact + gần giống) */

const STOP = new Set([
  "và",
  "của",
  "cho",
  "với",
  "các",
  "một",
  "những",
  "trong",
  "là",
  "để",
  "khi",
  "the",
  "and",
  "for",
  "with",
  "from",
  "into",
  "what",
  "why",
  "how",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
]);

export function normalizeTopicKey(topic: string): string {
  return topic
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(topic: string): Set<string> {
  return new Set(
    normalizeTopicKey(topic)
      .split(" ")
      .filter((t) => {
        if (STOP.has(t)) return false;
        // Giữ acronym / tech ngắn: mcp, api, adr, cap, sre...
        if (t.length >= 2 && t.length <= 5) return /^[a-z0-9]+$/.test(t);
        return t.length > 2;
      }),
  );
}

/** true nếu hai chủ đề coi là trùng / quá gần */
export function topicsOverlap(a: string, b: string, threshold = 0.55): boolean {
  const na = normalizeTopicKey(a);
  const nb = normalizeTopicKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return false;

  let inter = 0;
  const shared: string[] = [];
  for (const t of ta) {
    if (tb.has(t)) {
      inter += 1;
      shared.push(t);
    }
  }
  const union = ta.size + tb.size - inter;
  const jaccard = inter / union;
  const shorter = Math.min(ta.size, tb.size);
  const coverage = inter / shorter;

  // Cùng acronym/tech ngắn (mcp, api, adr…) → cùng cụm chủ đề, không auto viết lại
  const sharedAcronym = shared.some((t) => t.length >= 2 && t.length <= 5);
  if (sharedAcronym) return true;

  return jaccard >= threshold || (inter >= 2 && coverage >= 0.6);
}

export function isTopicUsed(candidate: string, usedTopics: string[]): boolean {
  return usedTopics.some((u) => topicsOverlap(candidate, u));
}
