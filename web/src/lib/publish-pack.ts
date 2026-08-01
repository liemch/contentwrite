import { chatCompletion } from "@/lib/nvidia";
import { clipText, stripPipelineMarks } from "@/lib/tfes/parser";
import { prepareReaderContent } from "@/lib/publish-content";

export type PublishPack = {
  excerpt: string;
  linkedin: string;
  xPost: string;
  tags: string[];
};

function fallbackPack(clean: string, title: string | null | undefined): PublishPack {
  const body = prepareReaderContent(stripPipelineMarks(clean), {
    stripLeadingHeroImage: true,
    stripHeroBriefSection: true,
  })
    .replace(/^#[^\n]+\n+/, "")
    .replace(/^\*[^\n]+\*\n+/, "")
    .trim();
  const firstPara =
    body
      .split(/\n\n+/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .find((p) => p.length > 40 && !p.startsWith("#") && !p.startsWith("![")) ||
    body.slice(0, 220);
  const excerpt = firstPara.slice(0, 220).trim();
  const head = (title || "Bài mới").trim();
  return {
    excerpt,
    linkedin: `${head}\n\n${excerpt}\n\n— Đọc full trong Proofdesk.`,
    xPost: excerpt.length > 240 ? `${excerpt.slice(0, 220).trim()}…` : excerpt,
    tags: [],
  };
}

function parsePackJson(raw: string): PublishPack | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const data = JSON.parse(m[0]) as Partial<PublishPack>;
    if (!data.excerpt || !data.linkedin) return null;
    return {
      excerpt: String(data.excerpt).trim(),
      linkedin: String(data.linkedin).trim(),
      xPost: String(data.xPost || data.excerpt).trim().slice(0, 280),
      tags: Array.isArray(data.tags)
        ? data.tags.map((t) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, 8)
        : [],
    };
  } catch {
    return null;
  }
}

/** Sinh gói đăng từ bản sạch — LLM ngắn; fallback cắt đoạn mở nếu lỗi. */
export async function buildPublishPack(input: {
  title?: string | null;
  topic?: string | null;
  cleanPublish: string;
  domain?: string | null;
}): Promise<PublishPack> {
  const clean = (input.cleanPublish ?? "").trim();
  if (clean.length < 80) {
    throw new Error("Cần bản sạch trước khi sinh Gói đăng");
  }

  const fallback = fallbackPack(clean, input.title || input.topic);
  try {
    const raw = await chatCompletion(
      [
        {
          role: "system",
          content:
            "Bạn là biên tập viên social cho blog kỹ thuật tiếng Việt. Chỉ trả JSON hợp lệ, không markdown.",
        },
        {
          role: "user",
          content: `Từ bài dưới, tạo gói đăng mạng.

Trả JSON đúng schema:
{
  "excerpt": "1–2 câu tóm luận điểm (≤220 ký tự, không spoiler hết bài)",
  "linkedin": "caption LinkedIn 3–6 câu: hook + 1 insight + CTA đọc bài; có xuống dòng",
  "xPost": "1 post X/Twitter ≤260 ký tự, sắc, không hashtag dày",
  "tags": ["3-6 tag ngắn không dấu #", "..."]
}

CẤM: mở kiểu “Trong một sprint… công ty fintech”; CẤM emoji spam; CẤM bịa số liệu.

Title: ${input.title || input.topic || "—"}
Domain: ${input.domain || "—"}

=== BÀI ===
${clipText(
  prepareReaderContent(stripPipelineMarks(clean), {
    stripLeadingHeroImage: true,
    stripHeroBriefSection: true,
  }),
  5_000,
)}`,
        },
      ],
      { maxTokens: 900, temperature: 0.4, reasoningEffort: "low" },
    );
    return parsePackJson(raw) ?? fallback;
  } catch {
    return fallback;
  }
}
