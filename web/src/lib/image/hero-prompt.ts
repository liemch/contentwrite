/** Parse / sanitize hero image prompt — dùng được ở client + server (không phụ thuộc Node). */

function stripMd(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/`+/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prompt ngắn, ASCII-heavy — FLUX cloud hay trả ảnh đen nếu nhồi markdown/VI/cấm đoán dài */
export function sanitizeFluxPrompt(raw: string, topic: string): string {
  let p = stripMd(raw)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  p = p
    .replace(/\bno\s+(readable\s+)?text[^.]*\.?/gi, "")
    .replace(/\bno\s+real\s+people[^.]*\.?/gi, "")
    .replace(/\bno\s+logos?[^.]*\.?/gi, "")
    .replace(/\bno\s+fake\s+charts?[^.]*\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (p.length < 24) {
    p = `Minimal abstract editorial tech illustration about ${topic}. Soft teal geometric forms, magazine hero composition.`;
  }

  p = p.slice(0, 480).trim();
  if (!/[.!?]$/.test(p)) p = `${p}.`;
  return `${p} Clean abstract editorial style, soft lighting.`;
}

/** Lấy prompt English từ Hero Brief (hoặc fallback theo topic). */
export function extractPromptFromHeroBrief(
  heroBrief: string | null | undefined,
  fallbackTopic: string,
): string {
  const topic = fallbackTopic.slice(0, 80) || "technology";
  const fallback = `Minimal abstract editorial tech illustration about ${topic}. Soft teal lighting, geometric forms, magazine cover mood.`;

  if (!heroBrief?.trim()) return sanitizeFluxPrompt(fallback, topic);

  const promptMatch =
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*"([^"]+)"/i) ||
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*'([^']+)'/i) ||
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*([^\n]+)/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:?\s*"([^"]+)"/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:?\s*'([^']+)'/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:?\s*([^\n]+)/i) ||
    heroBrief.match(/English prompt\s*:\s*"([^"]+)"/i) ||
    heroBrief.match(/English prompt\s*:\s*([^\n]+)/i) ||
    heroBrief.match(/```(?:text|prompt)?\n([\s\S]*?)```/i);

  let base = stripMd(promptMatch?.[1] || "");

  if (base.length < 40) {
    const englishLines = heroBrief
      .split(/\n+/)
      .map((l) => stripMd(l))
      .filter((l) => l.length > 40 && /[a-zA-Z]{4,}/.test(l) && !/HERO|Concept|Caption|Alt|Status/i.test(l))
      .filter(
        (l) =>
          (l.match(/[a-zA-Z]/g)?.length ?? 0) >
          (l.match(/[àáạảãăằắặẳẵâầấậẩẫèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi)?.length ??
            0) *
            2,
      );
    base = englishLines.sort((a, b) => b.length - a.length)[0] || "";
  }

  if (base.length < 24) base = fallback;
  return sanitizeFluxPrompt(base, topic);
}

/** Prompt hiển thị để user sửa — ưu tiên chưa sanitize cứng (giữ ý chủ đề). */
export function suggestEditableHeroPrompt(input: {
  heroPromptUsed?: string | null;
  heroBrief?: string | null;
  topic?: string | null;
  title?: string | null;
}): string {
  if (input.heroPromptUsed?.trim()) {
    return input.heroPromptUsed.trim();
  }
  const topic = (input.topic || input.title || "technology").slice(0, 80);
  const fromBrief = extractPromptFromHeroBrief(input.heroBrief, topic);
  // Bỏ suffix style cố định khi đưa vào ô sửa — user thấy prompt gọn hơn
  return fromBrief.replace(/\s*Clean abstract editorial style, soft lighting\.?\s*$/i, "").trim();
}

export function extractAlt(heroBrief: string | null | undefined, title: string): string {
  const altMatch =
    heroBrief?.match(/\*\*[^*]*Alt[^*]*:\*\*\s*([^\n]+)/i) ||
    heroBrief?.match(/Alt\s*text\s*:\s*([^\n]+)/i) ||
    heroBrief?.match(/^Alt:\s*([^\n]+)/im);
  return stripMd(altMatch?.[1] || title || "Hero illustration").slice(0, 180);
}

export function resolveHeroPrompt(input: {
  promptOverride?: string | null;
  heroBrief?: string | null;
  topic?: string | null;
  title?: string | null;
}): string {
  const topic = (input.topic || input.title || "technology").slice(0, 80);
  if (input.promptOverride?.trim()) {
    return sanitizeFluxPrompt(input.promptOverride.trim(), topic);
  }
  return extractPromptFromHeroBrief(input.heroBrief, topic);
}
