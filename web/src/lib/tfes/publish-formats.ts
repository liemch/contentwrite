/**
 * Định dạng xuất bản — cùng pipeline, đầu ra khác (blog / ADR / brief / …).
 */

import {
  ARTICLE_SHAPES,
  formatShapePromptBlock,
  type ArticleShape,
  type ArticleShapeId,
  pickArticleShapeId,
} from "@/lib/tfes/article-shapes";

export type PublishFormatId =
  | "blog"
  | "field-note"
  | "postmortem"
  | "adr"
  | "internal-brief"
  | "thread-qa";

export type PublishFormat = {
  id: PublishFormatId;
  labelVi: string;
  desc: string;
  /** Shape cố định — null = xoay theo articleId như blog */
  lockShape: ArticleShapeId | null;
  /** Gợi ý số từ (UI) */
  wordHint: number;
  /** Đoạn thêm vào prompt */
  promptExtra: string;
};

export const PUBLISH_FORMATS: Record<PublishFormatId, PublishFormat> = {
  blog: {
    id: "blog",
    labelVi: "Blog / tin kỹ thuật",
    desc: "Bài đọc liền công khai nội bộ — shape xoay theo bài",
    lockShape: null,
    wordHint: 1200,
    promptExtra:
      "Định dạng: BLOG/TIN kỹ thuật. Độc giả lướt điện thoại; giọng blog, không handbook.",
  },
  "field-note": {
    id: "field-note",
    labelVi: "Field note",
    desc: "Ghi chú hẹp, quyết định tuần này — ngắn, thực dụng",
    lockShape: "field-note",
    wordHint: 700,
    promptExtra:
      "Định dạng: FIELD NOTE. Ngắn, một quyết định hẹp; ít triết lý; tín hiệu nhận biết + anti-pattern.",
  },
  postmortem: {
    id: "postmortem",
    labelVi: "Postmortem",
    desc: "Sự cố / failure mode có timeline và bài học hẹp",
    lockShape: "failure-postmortem",
    wordHint: 1000,
    promptExtra:
      "Định dạng: POSTMORTEM. Mở bằng sự cố; root cause thật; giả thuyết sai; giới hạn cách chữa.",
  },
  adr: {
    id: "adr",
    labelVi: "ADR / quyết định",
    desc: "Architecture Decision Record — ngữ cảnh, quyết định, hệ quả",
    lockShape: "adr",
    wordHint: 800,
    promptExtra:
      "Định dạng: ADR. Cấu trúc: Context → Decision → Consequences → khi nào revisit. Giọng hợp đồng với tương lai, không blog kể chuyện dài.",
  },
  "internal-brief": {
    id: "internal-brief",
    labelVi: "Brief nội bộ",
    desc: "1 trang cho lead — luận điểm, rủi ro, quyết định cần",
    lockShape: "internal-brief",
    wordHint: 600,
    promptExtra:
      "Định dạng: INTERNAL BRIEF (1 trang lead). Mở thẳng đề xuất; 3–5 bullet rủi ro/điều kiện; CTA quyết định. CẤM hook văn chương dài.",
  },
  "thread-qa": {
    id: "thread-qa",
    labelVi: "Thread / Q&A",
    desc: "Chuỗi câu hỏi–đáp kỹ thuật, đọc như thread",
    lockShape: "thread-qa",
    wordHint: 900,
    promptExtra:
      "Định dạng: THREAD/Q&A. Mỗi ## là một câu hỏi hoặc beat trả lời; mạch hỏi→đáp→điều kiện. Không essay dài một khối.",
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
}): ArticleShape {
  const format = resolvePublishFormat(input.publishFormat);
  if (format.lockShape && ARTICLE_SHAPES[format.lockShape]) {
    return ARTICLE_SHAPES[format.lockShape];
  }
  return ARTICLE_SHAPES[pickArticleShapeId(input.articleId)];
}

/** Block shape + format nhúng Planning / Write / Publish */
export function formatPublishShapePrompt(input: {
  articleId: string;
  publishFormat?: string | null;
}): string {
  const format = resolvePublishFormat(input.publishFormat);
  const shape = resolveShapeForArticle(input);
  const formatExtra = `### PUBLISH_FORMAT
- **Format:** \`${format.id}\` — ${format.labelVi}
- ${format.promptExtra}
`;
  return formatShapePromptBlock(shape, formatExtra);
}
