const CLEAN_MARKER = "=== BẢN SẠCH ĐỂ ĐĂNG ===";
const STATUS_MARKER = "STATUS: Publish Ready";

export const WRITE_HALF_MARK = "<!--TFES_DRAFT_HALF-->";
export const WRITE_DONE_MARK = "<!--TFES_DRAFT_DONE-->";

export type ParsedOutputs = {
  researchBrief?: string;
  insightGate?: string;
  draft12?: string;
  factCheck?: string;
  knowledgeRecord?: string;
  cleanPublish?: string;
  heroBrief?: string;
};

export function stripPipelineMarks(text: string | null | undefined): string {
  return (text ?? "")
    .replaceAll(WRITE_HALF_MARK, "")
    .replaceAll(WRITE_DONE_MARK, "")
    .replace(/<!--TFES_[A-Z0-9_]+-->/g, "")
    .trim();
}

export function extractSection(text: string, startLabel: RegExp, endLabel?: RegExp): string | undefined {
  const startMatch = text.match(startLabel);
  if (!startMatch || startMatch.index === undefined) return undefined;

  const start = startMatch.index + startMatch[0].length;
  const rest = text.slice(start);

  if (endLabel) {
    const endMatch = rest.match(endLabel);
    if (endMatch?.index !== undefined) {
      return rest.slice(0, endMatch.index).trim();
    }
  }

  return rest.trim();
}

export function parseFullOutput(text: string): ParsedOutputs {
  // Llama/gpt-oss hay viết lệch marker — chấp nhận vài biến thể
  const cleanMatchers = [
    /===\s*BẢN SẠCH ĐỂ ĐĂNG\s*===/i,
    /#{1,3}\s*BẢN SẠCH ĐỂ ĐĂNG/i,
    /\*\*BẢN SẠCH ĐỂ ĐĂNG\*\*/i,
    /6\)\s*===?\s*BẢN SẠCH/i,
  ];

  let cleanPublish: string | undefined;
  for (const re of cleanMatchers) {
    const m = text.match(re);
    if (m?.index !== undefined) {
      cleanPublish = text
        .slice(m.index + m[0].length)
        .split(STATUS_MARKER)[0]
        ?.replace(/^[\s:：\-–]+/, "")
        .trim();
      if (cleanPublish) break;
    }
  }

  if (!cleanPublish) {
    const cleanIdx = text.indexOf(CLEAN_MARKER);
    if (cleanIdx >= 0) {
      cleanPublish = text
        .slice(cleanIdx + CLEAN_MARKER.length)
        .split(STATUS_MARKER)[0]
        ?.trim();
    }
  }

  const heroBrief = extractSection(
    text,
    /HERO IMAGE BRIEF/i,
    /STATUS:|=== BẢN SẠCH|BẢN SẠCH ĐỂ ĐĂNG/i,
  );

  return {
    researchBrief: extractSection(text, /1\)\s*Research Brief/i, /2\)\s*Insight/i),
    insightGate: extractSection(text, /2\)\s*Insight/i, /3\)\s*Bài/i),
    draft12: extractSection(text, /3\)\s*Bài viết/i, /4\)\s*Fact/i),
    factCheck: extractSection(text, /4\)\s*Fact-?Check/i, /5\)\s*Knowledge/i),
    knowledgeRecord: extractSection(text, /5\)\s*Knowledge Record/i, /6\)|=== BẢN SẠCH|BẢN SẠCH ĐỂ ĐĂNG/i),
    cleanPublish,
    heroBrief,
  };
}

export function appendContext(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("\n\n---\n\n");
}

/** Cắt context cho từng phase pipeline */
export function clipText(text: string | null | undefined, maxChars: number): string {
  const t = (text ?? "").trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n\n[…đã cắt ${t.length - maxChars} ký tự để tránh timeout]`;
}
