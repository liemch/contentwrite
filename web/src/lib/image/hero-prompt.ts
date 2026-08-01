/** Parse / sanitize / ground image prompts — client + server safe. */

function stripMd(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/`+/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rút luận điểm ngắn từ bản sạch để neo prompt (không phụ thuộc LLM). */
export function extractArticleThesis(input: {
  cleanPublish?: string | null;
  title?: string | null;
  topic?: string | null;
}): string {
  const title = (input.title || input.topic || "").trim();
  const raw = (input.cleanPublish || "")
    .replace(/^#[^\n]+\n+/, "")
    .replace(/^\*[^\n]+\*\n+/, "")
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/<!--pd-img:[^>]+-->/g, "")
    .trim();

  const paras = raw
    .split(/\n{2,}/)
    .map((p) => stripMd(p.replace(/\n/g, " ")))
    .filter((p) => p.length > 40 && !/^references?/i.test(p))
    .slice(0, 2);

  const headings = [...raw.matchAll(/^#{2,3}\s+(.+)$/gm)]
    .map((m) => stripMd(m[1] || ""))
    .filter(Boolean)
    .slice(0, 4);

  const parts = [title, ...paras, headings.length ? `Sections: ${headings.join(" · ")}` : ""]
    .filter(Boolean)
    .join(" — ");

  return parts.slice(0, 700);
}

const GENERIC_BAD =
  /futuristic technology background|circuit boards?|glowing code|abstract servers?|neon cyber|holographic ui/i;

/** Prompt English sạch cho FLUX — giữ metaphor, bỏ markdown/cấm đoán dài. */
export function sanitizeFluxPrompt(raw: string, topic: string): string {
  let p = stripMd(raw)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  p = p
    .replace(/\bno\s+(readable\s+)?text[^.]*\.?/gi, "")
    .replace(/\bno\s+watermarks?[^.]*\.?/gi, "")
    .replace(/\bno\s+logos?[^.]*\.?/gi, "")
    .replace(/\bno\s+real\s+people[^.]*\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (p.length < 28 || GENERIC_BAD.test(p)) {
    const t = topic.slice(0, 120) || "the article thesis";
    p = `Symbolic editorial magazine illustration about ${t}. Concrete visual metaphor, cinematic soft light, shallow depth of field, muted teal and ink tones, no text.`;
  }

  p = p.slice(0, 520).trim();
  if (!/[.!?]$/.test(p)) p = `${p}.`;
  // Style suffix — editorial quality, not generic stock
  if (!/editorial|magazine|cinematic/i.test(p)) {
    p = `${p} Editorial magazine hero, cinematic composition, refined color grade.`;
  }
  return p;
}

export function extractPromptFromHeroBrief(
  heroBrief: string | null | undefined,
  fallbackTopic: string,
): string {
  const topic = fallbackTopic.slice(0, 120) || "technology";
  const fallback = `Symbolic editorial illustration of ${topic}. Metaphorical scene matching the thesis, soft cinematic light, no text or logos.`;

  if (!heroBrief?.trim()) return sanitizeFluxPrompt(fallback, topic);

  const promptMatch =
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*"([^"]+)"/i) ||
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*'([^']+)'/i) ||
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*([^\n]+)/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:?\s*"([^"]+)"/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:?\s*'([^']+)'/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:?\s*([^\n]+)/i) ||
    heroMatchEnglish(heroBrief);

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

  if (base.length < 24 || GENERIC_BAD.test(base)) base = fallback;
  return sanitizeFluxPrompt(base, topic);
}

function heroMatchEnglish(heroBrief: string) {
  return (
    heroBrief.match(/English prompt\s*:\s*"([^"]+)"/i) ||
    heroBrief.match(/English prompt\s*:\s*([^\n]+)/i) ||
    heroBrief.match(/```(?:text|prompt)?\n([\s\S]*?)```/i)
  );
}

export function suggestEditableHeroPrompt(input: {
  heroPromptUsed?: string | null;
  heroBrief?: string | null;
  topic?: string | null;
  title?: string | null;
  cleanPublish?: string | null;
}): string {
  if (input.heroPromptUsed?.trim()) {
    return input.heroPromptUsed
      .trim()
      .replace(/\s*Editorial magazine hero, cinematic composition, refined color grade\.?\s*$/i, "")
      .trim();
  }
  const thesis = extractArticleThesis(input);
  const topic = thesis.slice(0, 160) || input.topic || input.title || "technology";
  const fromBrief = extractPromptFromHeroBrief(input.heroBrief, topic);
  return fromBrief
    .replace(/\s*Editorial magazine hero, cinematic composition, refined color grade\.?\s*$/i, "")
    .trim();
}

export function extractAlt(heroBrief: string | null | undefined, title: string): string {
  const altMatch =
    heroBrief?.match(/\*\*[^*]*Alt[^*]*:\*\*\s*([^\n]+)/i) ||
    heroBrief?.match(/Alt\s*text\s*:\s*([^\n]+)/i) ||
    heroBrief?.match(/^Alt:\s*([^\n]+)/im);
  const alt = stripMd(altMatch?.[1] || "");
  if (alt.length >= 12) return alt.slice(0, 180);
  return `Minh họa: ${(title || "chủ đề bài").slice(0, 140)}`;
}

export function resolveHeroPrompt(input: {
  promptOverride?: string | null;
  heroBrief?: string | null;
  topic?: string | null;
  title?: string | null;
  cleanPublish?: string | null;
}): string {
  const thesis = extractArticleThesis(input);
  const topic = thesis.slice(0, 160) || input.topic || input.title || "technology";
  if (input.promptOverride?.trim()) {
    return sanitizeFluxPrompt(input.promptOverride.trim(), topic);
  }
  return extractPromptFromHeroBrief(input.heroBrief, topic);
}

/** Alt grounded: ưu tiên override → brief → title/topic thesis. */
export function resolveImageAlt(input: {
  altOverride?: string | null;
  heroBrief?: string | null;
  title?: string | null;
  topic?: string | null;
  conceptVi?: string | null;
}): string {
  if (input.altOverride?.trim()) return input.altOverride.trim().slice(0, 180);
  if (input.conceptVi?.trim()) return input.conceptVi.trim().slice(0, 180);
  return extractAlt(input.heroBrief, input.title || input.topic || "Minh họa bài viết");
}
