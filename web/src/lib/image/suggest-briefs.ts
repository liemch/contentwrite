import { chatCompletion } from "@/lib/nvidia";
import {
  extractArticleThesis,
  extractArticleVisualContext,
} from "@/lib/image/hero-prompt";
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
  const visualContext = extractArticleVisualContext(input);

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
- Hero PHẢI thể hiện mâu thuẫn hoặc takeaway trung tâm, không chỉ minh họa danh từ trong title
- Mỗi inline phải neo vào một SECTION cụ thể và khác nhau; afterHeadingIndex phải đúng section đó
- promptEn phải tự đủ nghĩa với: chủ thể cụ thể + hành động/tương quan + bối cảnh + bố cục; ưu tiên một scene rõ thay vì chồng nhiều biểu tượng
- Chỉ dùng vật thể/metaphor có quan hệ giải thích được với luận điểm; không tự thêm robot, server, chip hoặc dashboard vì bài thuộc domain công nghệ
- CẤM sáo: "abstract futuristic technology background", "circuit boards", "glowing code on screen", "servers with neon" trừ khi bài đúng chủ đề đó
- CẤM text/numbers/charts/logos/real people/watermark trong ảnh (ghi trong prompt)
- afterHeadingIndex: index ## trong bài (0-based) để chèn inline; hero có thể null
- Chỉ xuất JSON array, không markdown giải thích

TITLE: ${input.title || input.topic || "(không tiêu đề)"}
TOPIC: ${input.topic || ""}
CENTRAL THESIS:
${clipText(thesis, 900)}

ARTICLE MAP (opening → từng section → takeaway):
${visualContext}

HERO BRIEF CŨ (tham khảo, có thể sai — ưu tiên luận điểm bài):
${clipText(input.heroBrief, 800)}
`,
      },
    ],
    { maxTokens: 1800, temperature: 0.3, reasoningEffort: "low" },
  );

  let slots = parseSlotsJson(raw);
  if (slots.length > 0) {
    try {
      const critiquedRaw = await chatCompletion(
        [
          { role: "system", content: getSystemPromptLite(input.domain) },
          {
            role: "user",
            content: `## Nhiệm vụ: VISUAL GROUNDING CHECK

Kiểm tra và viết lại các candidate dưới đây. Chỉ trả JSON array cùng schema.

Tiêu chuẩn bắt buộc:
- Hero phải khiến người đọc nhận ra đúng mâu thuẫn/takeaway của bài khi đặt cạnh title.
- Inline phải minh họa chính xác section tại afterHeadingIndex, không chỉ cùng chủ đề chung.
- Mỗi prompt English là một scene cụ thể: subject + action/relationship + environment + composition.
- Loại prompt trang trí, stock, generic tech; loại chi tiết không có cơ sở trong ARTICLE MAP.
- Không text/numbers/charts/logos/real people/watermark. Giữ đúng ${count} phần tử nếu có thể.

ARTICLE MAP:
${visualContext}

CANDIDATES:
${JSON.stringify(slots)}
`,
          },
        ],
        { maxTokens: 1800, temperature: 0.15, reasoningEffort: "low" },
      );
      const critiqued = parseSlotsJson(critiquedRaw);
      if (critiqued.length === slots.length) slots = critiqued;
    } catch {
      // Giữ candidate pass đầu nếu critic tạm timeout; không làm hỏng thao tác gợi ý.
    }
  }
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
