const CLEAN_MARKER = "=== BẢN SẠCH ĐỂ ĐĂNG ===";
const STATUS_MARKER = "STATUS: Publish Ready";

export const WRITE_HALF_MARK = "<!--TFES_DRAFT_HALF-->";
export const WRITE_DONE_MARK = "<!--TFES_DRAFT_DONE-->";
/** Insight Gate ≥ L2 (OP: giữa Synthesis và Decision) */
export const INSIGHT_GATE_MARK = "<!--TFES_INSIGHT_GATE-->";
/** Editorial Decision xong (bước 5) */
export const INSIGHT_DECISION_MARK = "<!--TFES_INSIGHT_DECISION-->";
/** Planning xong (bước 6) → được sang Writing */
export const INSIGHT_DONE_MARK = "<!--TFES_INSIGHT_DONE-->";
/** Review checklist xong (bước 8) — lưu kèm knowledgeRecord tạm */
export const REVIEW_DONE_MARK = "<!--TFES_REVIEW_DONE-->";
/** Số lần đã research lại sau Gate &lt; L2 — <!--TFES_GATE_RETRY:N--> */
export const GATE_RETRY_RE = /<!--TFES_GATE_RETRY:(\d+)-->/;

export function gateRetryCount(text: string | null | undefined): number {
  const m = (text ?? "").match(GATE_RETRY_RE);
  return m ? Number(m[1]) || 0 : 0;
}

export function withGateRetryMark(n: number, body: string): string {
  const cleaned = body.replace(GATE_RETRY_RE, "").trim();
  if (n <= 0) return cleaned;
  return `<!--TFES_GATE_RETRY:${n}-->\n\n${cleaned}`.trim();
}

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
    .replace(GATE_RETRY_RE, "")
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

  // Bản sạch không được kèm Hero Brief (Hero lưu field riêng)
  if (cleanPublish) {
    cleanPublish = cleanPublish
      .replace(/\n+#{0,3}\s*HERO IMAGE BRIEF[\s\S]*$/i, "")
      .replace(/\n\*{0,2}HERO IMAGE BRIEF\*{0,2}[\s\S]*$/i, "")
      .replace(/\n*-{3,}\s*\n+#{0,3}\s*HERO IMAGE BRIEF[\s\S]*$/i, "")
      .trim();
  }

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
