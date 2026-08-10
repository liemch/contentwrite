/**
 * Định dạng xuất bản — cùng pipeline, đầu ra khác (blog / ADR / Facebook / …).
 * Mỗi format mang policy riêng: shape khóa, giọng, cấu trúc sạch, quality gate.
 */

import {
  ARTICLE_SHAPES,
  formatShapePromptBlock,
  type ArticleShape,
  type ArticleShapeId,
  pickArticleShapeId,
} from "@/lib/tfes/article-shapes";
import { wordsToSyllables } from "@/lib/tfes/word-count";

export type PublishFormatId =
  | "blog"
  | "field-note"
  | "postmortem"
  | "adr"
  | "internal-brief"
  | "thread-qa"
  | "facebook"
  | "linkedin"
  | "newsletter";

export type PublishFormatFamily = "blog" | "structured" | "social" | "newsletter";

export type PublishFormat = {
  id: PublishFormatId;
  labelVi: string;
  desc: string;
  /** Shape cố định — null = xoay theo articleId như blog */
  lockShape: ArticleShapeId | null;
  /** Gợi ý độ dài — TỪ tiếng Việt thật (xem word-count.ts), không phải tiếng */
  wordHint: number;
  /** Sàn máy chấm tuyệt đối, cũng tính bằng từ thật */
  wordFloor: number;
  family: PublishFormatFamily;
  requireHero: boolean;
  requireItalicSubtitle: boolean;
  /** Gate “pipeline/stage/retry…” — blog/postmortem */
  requireConcreteScene: boolean;
  /** Gate opener khô / handbook */
  requireBlogOpenerGates: boolean;
  /** Gate “không nên / chỉ khi” */
  requireHonestyBoundary: boolean;
  /** Đoạn thêm vào prompt (ngắn) */
  promptExtra: string;
  /** Giọng bản sạch */
  voiceRules: string;
  /** Khung markdown bản sạch */
  structureRules: string;
};

export const PUBLISH_FORMATS: Record<PublishFormatId, PublishFormat> = {
  blog: {
    id: "blog",
    labelVi: "Blog / tin kỹ thuật",
    desc: "Bài đọc liền công khai nội bộ — shape xoay theo bài",
    lockShape: null,
    wordHint: 750,
    wordFloor: 280,
    family: "blog",
    requireHero: true,
    requireItalicSubtitle: true,
    requireConcreteScene: true,
    requireBlogOpenerGates: true,
    requireHonestyBoundary: true,
    promptExtra:
      "Định dạng: BLOG/TIN kỹ thuật. Độc giả lướt điện thoại; giọng blog, không handbook.",
    voiceRules: `Giọng BLOG / TIN kỹ thuật:
- Mở bằng nghịch lý / failure+metric / quan sát nghề có hậu quả
- Câu chủ động, gần khẩu ngữ nghề nhưng chính xác
- Mỗi ## ≈ một “màn”: xung đột nhỏ → giải thích → hệ quả
- Kết bằng hệ quả hoặc câu hỏi mở — không tóm tắt 4 gạch
CẤM: “Trong môi trường… ngày càng phức tạp”; khuôn “sprint + đội + công ty fintech”; brochure.`,
    structureRules: `Cấu trúc: \`# Title\` → *phụ đề nghiêng* → \`![mô tả](HERO_IMAGE)\` → thân theo ARTICLE_SHAPE → References.
\`##\` đọc được; không heading biên tập; giữ HERO sau phụ đề.`,
  },
  "field-note": {
    id: "field-note",
    labelVi: "Field note",
    desc: "Ghi chú hẹp, quyết định tuần này — ngắn, thực dụng",
    lockShape: "field-note",
    wordHint: 440,
    wordFloor: 175,
    family: "structured",
    requireHero: false,
    requireItalicSubtitle: true,
    requireConcreteScene: false,
    requireBlogOpenerGates: false,
    requireHonestyBoundary: true,
    promptExtra:
      "Định dạng: FIELD NOTE. Ngắn, một quyết định hẹp; ít triết lý; tín hiệu nhận biết + anti-pattern.",
    voiceRules: `Giọng FIELD NOTE: thực dụng, thẳng quyết định. Không hook văn chương dài. Không ép giọng blog/tin.`,
    structureRules: `Cấu trúc: \`# Title\` → *một dòng lead nghiêng* → thân theo shape (không bắt buộc HERO). Kết một câu chốt mang đi được.`,
  },
  postmortem: {
    id: "postmortem",
    labelVi: "Postmortem",
    desc: "Sự cố / failure mode có timeline và bài học hẹp",
    lockShape: "failure-postmortem",
    wordHint: 620,
    wordFloor: 250,
    family: "blog",
    requireHero: true,
    requireItalicSubtitle: true,
    requireConcreteScene: true,
    requireBlogOpenerGates: true,
    requireHonestyBoundary: true,
    promptExtra:
      "Định dạng: POSTMORTEM. Mở bằng sự cố; root cause thật; giả thuyết sai; giới hạn cách chữa.",
    voiceRules: `Giọng POSTMORTEM: mở bằng sự cố cụ thể; timeline ngắn; root cause không đổ lỗi chung; bài học hẹp.`,
    structureRules: `Cấu trúc: \`# Title\` → *phụ đề nghiêng* → \`![mô tả](HERO_IMAGE)\` → timeline/root cause theo shape → References.`,
  },
  adr: {
    id: "adr",
    labelVi: "ADR / quyết định",
    desc: "Architecture Decision Record — ngữ cảnh, quyết định, hệ quả",
    lockShape: "adr",
    wordHint: 500,
    wordFloor: 190,
    family: "structured",
    requireHero: false,
    requireItalicSubtitle: false,
    requireConcreteScene: false,
    requireBlogOpenerGates: false,
    requireHonestyBoundary: true,
    promptExtra:
      "Định dạng: ADR. Context → Decision → Consequences → khi nào revisit. Giọng hợp đồng với tương lai.",
    voiceRules: `Giọng ADR: rõ ràng như hợp đồng nội bộ. Mở bằng constraint phải quyết. Không kể chuyện blog dài.`,
    structureRules: `Cấu trúc: \`# Title\` → ## Context / Options / Decision / Consequences / Revisit (wording tự do). Không HERO. Không phụ đề bắt buộc.`,
  },
  "internal-brief": {
    id: "internal-brief",
    labelVi: "Brief nội bộ",
    desc: "1 trang cho lead — luận điểm, rủi ro, quyết định cần",
    lockShape: "internal-brief",
    wordHint: 375,
    wordFloor: 140,
    family: "structured",
    requireHero: false,
    requireItalicSubtitle: false,
    requireConcreteScene: false,
    requireBlogOpenerGates: false,
    requireHonestyBoundary: true,
    promptExtra:
      "Định dạng: INTERNAL BRIEF. Mở thẳng đề xuất; 3–5 bullet rủi ro/điều kiện; CTA quyết định. CẤM hook văn dài.",
    voiceRules: `Giọng BRIEF: executive, ngắn. Mở “Cần quyết: …”. Bullet rủi ro được phép nếu không listicle Hook/Framework.`,
    structureRules: `Cấu trúc: \`# Title\` → đề xuất → rủi ro/điều kiện → CTA. Không HERO. Không phụ đề bắt buộc.`,
  },
  "thread-qa": {
    id: "thread-qa",
    labelVi: "Thread / Q&A",
    desc: "Chuỗi câu hỏi–đáp kỹ thuật, đọc như thread",
    lockShape: "thread-qa",
    wordHint: 560,
    wordFloor: 220,
    family: "structured",
    requireHero: false,
    requireItalicSubtitle: true,
    requireConcreteScene: false,
    requireBlogOpenerGates: false,
    requireHonestyBoundary: true,
    promptExtra:
      "Định dạng: THREAD/Q&A. Mỗi ## là câu hỏi hoặc beat trả lời; mạch hỏi→đáp→điều kiện.",
    voiceRules: `Giọng THREAD: hỏi–đáp rõ; mỗi ## một beat. Không essay một khối.`,
    structureRules: `Cấu trúc: \`# Title\` → *lead nghiêng* → ## hỏi/đáp theo shape. HERO tuỳ chọn (không bắt buộc).`,
  },
  facebook: {
    id: "facebook",
    labelVi: "Facebook",
    desc: "Bài mạng xã hội ngắn — hook, 1 ý, CTA nhẹ; đọc trên feed",
    lockShape: "facebook-post",
    wordHint: 175,
    wordFloor: 50,
    family: "social",
    requireHero: false,
    requireItalicSubtitle: false,
    requireConcreteScene: false,
    requireBlogOpenerGates: false,
    requireHonestyBoundary: false,
    promptExtra:
      "Định dạng: FACEBOOK POST. Ngắn, 1 luận điểm, hook 1–2 câu, CTA nhẹ. Không HERO, không essay, không heading dày.",
    voiceRules: `Giọng FACEBOOK:
- Hook 1–2 câu đầu (quan sát / nghịch lý / câu hỏi) — không clickbait rỗng
- Thân ngắn: 1 ý + 1 ví dụ đời thường hoặc nghề
- CTA nhẹ hoặc câu hỏi kết (không hard-sell)
- Xuống dòng dễ đọc trên mobile; emoji tối đa 1–2 nếu thật sự hợp (không bắt buộc)
CẤM: listicle “1. 2. 3.” marketing; HERO_IMAGE; phụ đề brochure; jargon pipeline.`,
    structureRules: `Cấu trúc: \`# Title\` (tiêu đề nội bộ / caption ngắn) → thân 2–5 đoạn ngắn, có thể dùng ## tối đa 2.
Không HERO. Không References dài (1 link nếu có trong Research). Không Knowledge Record.`,
  },
  linkedin: {
    id: "linkedin",
    labelVi: "LinkedIn",
    desc: "Post nghề nghiệp mid-form — insight + trải nghiệm, giọng chuyên nghiệp",
    lockShape: "linkedin-post",
    wordHint: 310,
    wordFloor: 95,
    family: "social",
    requireHero: false,
    requireItalicSubtitle: false,
    requireConcreteScene: false,
    requireBlogOpenerGates: false,
    requireHonestyBoundary: true,
    promptExtra:
      "Định dạng: LINKEDIN. Mid-form; insight nghề + điều kiện; giọng chuyên nghiệp, không salesy.",
    voiceRules: `Giọng LINKEDIN:
- Mở bằng quan sát nghề / bài học hẹp (không “I’m humbled…”)
- 1 insight có điều kiện + 1 ví dụ
- Kết bằng câu hỏi thảo luận hoặc takeaway 1 dòng
CẤM: hashtag spam; carousel script; HERO bắt buộc; giọng brochure HR.`,
    structureRules: `Cấu trúc: \`# Title\` → thân đoạn ngắn / ## tối đa 3. Không HERO. References tối đa 2 URL từ Research nếu cần.`,
  },
  newsletter: {
    id: "newsletter",
    labelVi: "Newsletter / email",
    desc: "Bản tin email — lead ngắn, 2–3 mục, CTA đọc thêm",
    lockShape: "newsletter",
    wordHint: 560,
    wordFloor: 200,
    family: "newsletter",
    requireHero: false,
    requireItalicSubtitle: true,
    requireConcreteScene: false,
    requireBlogOpenerGates: false,
    requireHonestyBoundary: true,
    promptExtra:
      "Định dạng: NEWSLETTER. Lead ngắn; 2–3 mục rõ; CTA. Giọng biên tập thân thiện, không whitepaper.",
    voiceRules: `Giọng NEWSLETTER:
- Subject-style title + lead nghiêng (preview text)
- 2–3 mục ## với 1 ý mỗi mục
- Có “khi nào bỏ qua” ngắn nếu hợp
- CTA cuối (đọc sâu / thảo luận)
CẤM: HERO bắt buộc; essay một khối; giọng handbook dài.`,
    structureRules: `Cấu trúc: \`# Title\` → *lead/preview nghiêng* → ## Mục 1… → CTA. HERO tuỳ chọn. References ngắn cuối nếu có.`,
  },
};

export const PUBLISH_FORMAT_IDS = Object.keys(PUBLISH_FORMATS) as PublishFormatId[];

export function resolvePublishFormat(
  raw: string | null | undefined,
): PublishFormat {
  const id = (raw || "blog").trim() as PublishFormatId;
  return PUBLISH_FORMATS[id] ?? PUBLISH_FORMATS.blog;
}

export function isPublishFormatId(raw: string | null | undefined): raw is PublishFormatId {
  return Boolean(raw && raw in PUBLISH_FORMATS);
}

/** Shape hiệu lực = lock theo format, hoặc xoay theo seed (blog). */
export function resolveShapeForArticle(input: {
  articleId: string;
  publishFormat?: string | null;
  articleShapeId?: string | null;
  articleShapeSnapshot?: string | null;
}): ArticleShape {
  if (input.articleShapeSnapshot?.trim()) {
    try {
      const snapshot = JSON.parse(input.articleShapeSnapshot) as Partial<ArticleShape>;
      if (snapshot.id && snapshot.beats?.length && snapshot.opening && snapshot.ending) {
        const fallback = ARTICLE_SHAPES[snapshot.id as ArticleShapeId] ?? ARTICLE_SHAPES["paradox-deepdive"];
        return { ...fallback, ...snapshot } as ArticleShape;
      }
    } catch {
      // Bài cũ/snapshot lỗi: fallback registry code để vẫn đọc được.
    }
  }
  if (input.articleShapeId && ARTICLE_SHAPES[input.articleShapeId as ArticleShapeId]) {
    return ARTICLE_SHAPES[input.articleShapeId as ArticleShapeId];
  }
  const format = resolvePublishFormat(input.publishFormat);
  if (format.lockShape && ARTICLE_SHAPES[format.lockShape]) {
    return ARTICLE_SHAPES[format.lockShape];
  }
  return ARTICLE_SHAPES[pickArticleShapeId(input.articleId)];
}

/** Block shape + format + voice/structure nhúng Planning / Write / Publish */
export function formatPublishShapePrompt(input: {
  articleId: string;
  publishFormat?: string | null;
  articleShapeId?: string | null;
  articleShapeSnapshot?: string | null;
}): string {
  const format = resolvePublishFormat(input.publishFormat);
  const shape = resolveShapeForArticle(input);
  const formatExtra = `### PUBLISH_FORMAT
- **Format:** \`${format.id}\` — ${format.labelVi}
- **Family:** ${format.family}
- ${format.promptExtra}
- Hero: ${format.requireHero ? "BẮT BUỘC" : "không bắt buộc"} · Phụ đề nghiêng: ${format.requireItalicSubtitle ? "nên có" : "tuỳ"}
- Độ dài gợi ý ~${format.wordHint} từ ≈ ${wordsToSyllables(format.wordHint)} tiếng (sàn máy ≥${format.wordFloor} từ)

### PUBLISH_VOICE
${format.voiceRules}

### CLEAN_STRUCTURE
${format.structureRules}
`;
  return formatShapePromptBlock(shape, formatExtra);
}
