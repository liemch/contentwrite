export type EditorialGateFailure = {
  code: string;
  label: string;
};

function gateCode(text: string): string | null {
  return text.match(/\b((?:G|N)\d+)\b/i)?.[1]?.toUpperCase() ?? null;
}

function isFailStatus(text: string): boolean {
  return /\bFAIL(?:ED)?\b/i.test(text);
}

function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  const cells = trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
  if (
    cells.length < 2 ||
    cells.every((cell) => /^:?-{3,}:?$/.test(cell) || cell === "")
  ) {
    return null;
  }
  return cells;
}

/**
 * Parse các gate G1–G8 / N1–N* bị đánh Fail từ bullet/checklist và Markdown table.
 * Chỉ row có mã gate thật mới được nhận; header/separator và row PASS bị bỏ qua.
 */
export function parseEditorialGateFailures(
  review: string | null | undefined,
): EditorialGateFailure[] {
  const failures = new Map<string, EditorialGateFailure>();

  for (const rawLine of (review ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const cells = tableCells(line);
    if (cells) {
      const code = cells.map(gateCode).find(Boolean) ?? null;
      if (!code || !cells.some(isFailStatus)) continue;
      const label =
        cells.find((cell) => cell !== code && !isFailStatus(cell) && !/^pass$/i.test(cell)) ??
        `${code} — Fail`;
      failures.set(code, { code, label: label.slice(0, 100) });
      continue;
    }

    const listMatch = line.match(
      /^(?:[-*]\s*)?(?:\[[ xX]\]\s*)?((?:G|N)\d+)\b(.*)$/i,
    );
    if (!listMatch || !isFailStatus(listMatch[2])) continue;
    const code = listMatch[1].toUpperCase();
    const label =
      listMatch[2]
        .replace(/\bFAIL(?:ED)?\b/gi, "")
        .replace(/^[:|\s-]+|[:|\s-]+$/g, "")
        .trim() || `${code} — Fail`;
    failures.set(code, { code, label: label.slice(0, 100) });
  }

  return [...failures.values()];
}

export function isMarkdownTableHeaderOrSeparator(line: string): boolean {
  if (/^\s*\|.*\bpass\s*\/\s*fail\b.*\|\s*$/i.test(line)) return true;
  const cells = tableCells(line);
  if (!cells) {
    return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);
  }
  const normalized = cells.join(" ").toLowerCase();
  return (
    /\bpass\s*\/\s*fail\b/.test(normalized) ||
    /^(?:tiêu chí|criterion|criteria|dimension|gate)\b/.test(normalized) ||
    cells.every((cell) => /^:?-{3,}:?$/.test(cell) || cell === "")
  );
}
