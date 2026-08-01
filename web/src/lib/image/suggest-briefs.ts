import { chatCompletion } from "@/lib/nvidia";
import { extractArticleThesis } from "@/lib/image/hero-prompt";
import {
  MAX_ARTICLE_IMAGES,
  type ImageBriefSlot,
  type GalleryImageRole,
} from "@/lib/image/gallery";
import { getSystemPromptLite } from "@/lib/tfes/prompts";
import { clipText } from "@/lib/tfes/parser";

function parseSlotsJson(raw: string): ImageBriefSlot[] {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fence?.[1] || raw).trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(text.slice(start, end + 1)) as unknown[];
    if (!Array.isArray(arr)) return [];
    return arr
      .map((item): ImageBriefSlot | null => {
        if (!item || typeof item !== "object") return null;
        const o = item as Record<string, unknown>;
        const promptEn = String(o.promptEn || o.prompt || "").trim();
        const altVi = String(o.altVi || o.alt || "").trim();
        const conceptVi = String(o.conceptVi || o.concept || altVi).trim();
        if (promptEn.length < 24) return null;
        const role: GalleryImageRole = o.role === "inline" ? "inline" : "hero";
        const after =
          typeof o.afterHeadingIndex === "number" && Number.isFinite(o.afterHeadingIndex)
            ? Math.max(0, Math.round(o.afterHeadingIndex))
            : null;
        return {
          role,
          promptEn: promptEn.slice(0, 520),
          altVi: (altVi || conceptVi || "Minh họa").slice(0, 180),
          conceptVi: conceptVi.slice(0, 200),
          afterHeadingIndex: after,
        };
      })
      .filter((x): x is ImageBriefSlot => Boolean(x))
      .slice(0, MAX_ARTICLE_IMAGES);
  } catch {
    return [];
  }
}

/**
 * LLM gợi ý 1–5 brief ảnh (prompt EN + alt VI) neo đúng luận điểm bài.
 */
export async function suggestImageBriefs(input: {
  domain: string;
  title?: string | null;
  topic?: string | null;
  cleanPublish?: string | null;
  heroBrief?: string | null;
  count?: number;
}): Promise<ImageBriefSlot[]> {
  const count = Math.min(MAX_ARTICLE_IMAGES, Math.max(1, input.count ?? 3));
  const thesis = extractArticleThesis(input);

  const raw = await chatCompletion(
    [
      { role: "system", content: getSystemPromptLite(input.domain) },
      {
        role: "user",
        content: `## Nhiệm vụ: GỢI Ý ${count} ẢNH MINH HỌA CHO BÀI

Đọc luận điểm / đoạn mở / heading. Xuất JSON array (${count} phần tử), mỗi phần tử:
{
  "role": "hero" | "inline",
  "conceptVi": "1 câu tiếng Việt — metaphor đúng bài",
  "promptEn": "English image prompt — concrete visual metaphor of THIS thesis",
  "altVi": "alt tiếng Việt ngắn",
  "afterHeadingIndex": 0
}

Quy tắc:
- Phần tử đầu role=hero; các phần còn lại role=inline (minh họa từng ý/section)
- promptEn PHẢI mirror luận điểm thật (vd. tốc độ vs kiến trúc → fork / unfinished scaffolding vs stopwatch)
- CẤM sáo: "abstract futuristic technology background", "circuit boards", "glowing code on screen", "servers with neon" trừ khi bài đúng chủ đề đó
- CẤM text/numbers/charts/logos/real people/watermark trong ảnh (ghi trong prompt)
- afterHeadingIndex: index ## trong bài (0-based) để chèn inline; hero có thể null
- Chỉ xuất JSON array, không markdown giải thích

TITLE: ${input.title || input.topic || "(không tiêu đề)"}
TOPIC: ${input.topic || ""}
THESIS / OPENING:
${clipText(thesis, 900)}

CLEAN EXCERPT:
${clipText(input.cleanPublish, 4_500)}

HERO BRIEF CŨ (tham khảo, có thể sai — ưu tiên luận điểm bài):
${clipText(input.heroBrief, 800)}
`,
      },
    ],
    { maxTokens: 1800, temperature: 0.45, reasoningEffort: "low" },
  );

  let slots = parseSlotsJson(raw);
  if (slots.length === 0) {
    // Fallback deterministic — vẫn neo thesis
    const t = thesis.slice(0, 140) || input.topic || "the article";
    slots = [
      {
        role: "hero",
        conceptVi: `Minh họa luận điểm: ${(input.title || input.topic || "bài viết").slice(0, 80)}`,
        promptEn: `Symbolic editorial magazine illustration about ${t}. Concrete metaphor, cinematic soft light, muted teal and ink, no text or logos.`,
        altVi: `Minh họa: ${(input.title || input.topic || "chủ đề").slice(0, 100)}`,
        afterHeadingIndex: null,
      },
    ];
  }

  // Enforce first = hero
  slots = slots.map((s, i) => ({
    ...s,
    role: i === 0 ? "hero" : "inline",
  }));

  return slots.slice(0, count);
}
