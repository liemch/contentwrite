const CLEAN_MARKER = "=== BẢN SẠCH ĐỂ ĐĂNG ===";
const STATUS_MARKER = "STATUS: Publish Ready";

export type ParsedOutputs = {
  researchBrief?: string;
  insightGate?: string;
  draft12?: string;
  factCheck?: string;
  knowledgeRecord?: string;
  cleanPublish?: string;
  heroBrief?: string;
};

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
  const cleanIdx = text.indexOf(CLEAN_MARKER);
  const cleanPublish =
    cleanIdx >= 0
      ? text.slice(cleanIdx + CLEAN_MARKER.length).split(STATUS_MARKER)[0]?.trim()
      : undefined;

  const heroBrief = extractSection(
    text,
    /HERO IMAGE BRIEF/i,
    /STATUS:|=== BẢN SẠCH/i,
  );

  return {
    researchBrief: extractSection(text, /1\)\s*Research Brief/i, /2\)\s*Insight/i),
    insightGate: extractSection(text, /2\)\s*Insight/i, /3\)\s*Bài/i),
    draft12: extractSection(text, /3\)\s*Bài viết/i, /4\)\s*Fact/i),
    factCheck: extractSection(text, /4\)\s*Fact-?Check/i, /5\)\s*Knowledge/i),
    knowledgeRecord: extractSection(text, /5\)\s*Knowledge Record/i, /6\)|=== BẢN SẠCH/i),
    cleanPublish,
    heroBrief,
  };
}

export function appendContext(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join("\n\n---\n\n");
}
