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
/** Review checklist xong (bước 8) — lưu kèm knowledgeRecord tạm (giữ sau Publish để Polish đọc) */
export const REVIEW_DONE_MARK = "<!--TFES_REVIEW_DONE-->";
/** Heading giữ excerpt Review trong knowledgeRecord sau khi có Knowledge Record thật */
export const PRIOR_REVIEW_HEADING = "## Editorial Review (pipeline)";
/** Bản sạch đã qua polish LLM (bước 10b) — sẵn sàng Reader Sim */
export const CLEAN_POLISH_MARK = "<!--TFES_CLEAN_POLISHED-->";
/** Reader Simulation xong (10c) — mới PUBLISH_READY */
export const READER_SIM_DONE_MARK = "<!--TFES_READER_SIM_DONE-->";
/** Số lần đã polish lại sau Reader Sim fail — <!--TFES_READER_SIM_RETRY:N--> */
export const READER_SIM_RETRY_RE = /<!--TFES_READER_SIM_RETRY:(\d+)-->/;
/** Số lần đã research lại sau Gate &lt; L2 — <!--TFES_GATE_RETRY:N--> */
export const GATE_RETRY_RE = /<!--TFES_GATE_RETRY:(\d+)-->/;

export function gateRetryCount(text: string | null | undefined): number {
  const m = (text ?? "").match(GATE_RETRY_RE);
  return m ? Number(m[1]) || 0 : 0;
}

export function readerSimRetryCount(text: string | null | undefined): number {
  const m = (text ?? "").match(READER_SIM_RETRY_RE);
  return m ? Number(m[1]) || 0 : 0;
}

export function withReaderSimRetryMark(n: number, body: string): string {
  const cleaned = body.replace(READER_SIM_RETRY_RE, "").trim();
  if (n <= 0) return cleaned;
  return `${cleaned}\n\n<!--TFES_READER_SIM_RETRY:${n}-->`.trim();
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

/**
 * Lấy góp ý Review từ knowledgeRecord:
 * - Sau bước 8: toàn bộ review + REVIEW_DONE_MARK
 * - Sau Publish: section "## Editorial Review (pipeline)"
 */
export function extractEditorialReview(
  knowledgeRecord: string | null | undefined,
): string {
  const raw = knowledgeRecord ?? "";
  if (!raw.trim()) return "";

  const preserved = raw.match(
    /##\s*Editorial Review \(pipeline\)\s*([\s\S]*?)(?=\n##\s*Reader Simulation|\n<!--TFES_READER_SIM|\n<!--TFES_REVIEW_DONE-->|$)/i,
  );
  if (preserved?.[1]?.trim()) return preserved[1].trim();

  if (raw.includes(REVIEW_DONE_MARK)) {
    return stripPipelineMarks(raw)
      .replace(/\n+##\s*Reader Simulation[\s\S]*$/i, "")
      .replace(/\n+##\s*Editorial Review \(pipeline\)[\s\S]*$/i, "")
      .trim();
  }
  return "";
}

/** Ghép Knowledge Record mới với excerpt Review (để bước Polish / Reader Sim vẫn đọc được). */
export function mergeKnowledgeWithPriorReview(
  knowledgeRecord: string | null | undefined,
  priorReview: string | null | undefined,
): string {
  const base = stripPipelineMarks(knowledgeRecord)
    .replace(/\n+##\s*Editorial Review \(pipeline\)[\s\S]*?(?=\n##\s*Reader Simulation|$)/i, "")
    .replace(/\n+##\s*Reader Simulation[\s\S]*$/i, "")
    .trim();
  const rev = (priorReview ?? "").trim();
  if (!rev) return base;
  const clipped = rev.length > 2_800 ? `${rev.slice(0, 2_800)}\n…` : rev;
  return `${base}\n\n${PRIOR_REVIEW_HEADING}\n${clipped}\n\n${REVIEW_DONE_MARK}`.trim();
}
