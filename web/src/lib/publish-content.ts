/** Chuẩn hoá bản sạch / nháp khi lưu & hiển thị — tránh đúp ảnh / lộ brief biên tập */

/** Gỡ nhãn cấp insight khỏi Title / Subtitle (model hay gắn (L2)) */
export function stripInsightLevelLabels(text: string): string {
  return text
    .replace(/\s*[\(\[｛【]\s*L\s*[0-3]\s*[\)\]｝】]/gi, "")
    .replace(/\s*[-–—|/]\s*L\s*[0-3]\b/gi, "")
    .replace(/\bL\s*[0-3]\s*[-–—:]\s*/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Gỡ khối HERO IMAGE BRIEF khỏi body bài (chỉ thuộc finalize / tab Hero) */
export function stripHeroBriefSection(text: string): string {
  return text
    .replace(
      /\n*-{3,}\s*\n+#{0,3}\s*HERO IMAGE BRIEF[\s\S]*?(?=\n-{3,}\s*$|$)/i,
      "\n",
    )
    .replace(
      /\n+#{0,3}\s*HERO IMAGE BRIEF[\s\S]*?(?=\n#{1,3}\s|\nSTATUS:|\n-{3,}\s*$|$)/i,
      "\n",
    )
    .replace(/\n\*{0,2}HERO IMAGE BRIEF\*{0,2}[\s\S]*?(?=\nSTATUS:|\n-{3,}\s*$|$)/i, "\n")
    .replace(/\n-{3,}\s*$/g, "")
    .trim();
}

/**
 * Meta biên tập / machine contract không được xuất hiện trên bản người đọc.
 * Chỉ dùng trên clean publish / reader prepare — không scrub Insight Gate hay Review raw.
 */
export function stripReaderFacingMeta(text: string): string {
  let body = text;

  // Whole lines that are pure editorial/machine jargon
  body = body.replace(
    /^\s*(?:\*{0,2})?(?:Insight\s*Gate|Cổng\s*Insight|Gate\s*(?:Insight)?)\b[^\n]*$/gim,
    "",
  );
  body = body.replace(
    /^\s*(?:\*{0,2})?(?:PROVISIONAL_(?:TOTAL|INSIGHT)_SCORE|EDITORIAL_DECISION|GATES_G1_G8|FINAL_(?:TOTAL|INSIGHT)_SCORE|FINAL_DECISION|GOLD_BAR)\s*[:：=].*$/gim,
    "",
  );
  body = body.replace(/^\s*GOLD_BAR\s*:[^\n]*$/gim, "");
  body = body.replace(
    /^\s*(?:\*{0,2})?Insight\s*L\s*[0-3]\s*(?:\/\s*L\s*[0-3])?\s*[:：].*$/gim,
    "",
  );
  body = body.replace(
    /^\s*(?:\*{0,2})?(?:ĐẠT|CHƯA ĐẠT)\s*(?:≥\s*)?L\s*[0-3]\b[^\n]*$/gim,
    "",
  );

  // Inline jargon → neutral reader language or removal
  body = body.replace(/\(\s*L\s*[0-3]\s*insight\s*\)/gi, "");
  body = body.replace(/\bL\s*[0-3]\s*insight\b/gi, "insight");
  body = body.replace(/\binsight\s*L\s*[0-3](?:\s*\/\s*L\s*[0-3])?\b/gi, "insight");
  body = body.replace(/\bInsight\s*Gate\b/gi, "luận điểm trung tâm");
  body = body.replace(/\bCổng\s*Insight\b/gi, "luận điểm trung tâm");
  body = body.replace(
    /\b(?:đạt|chua đạt|chưa đạt)\s*(?:≥\s*)?L\s*[0-3]\b/gi,
    "",
  );
  body = body.replace(/\b(?:≥\s*)?L\s*[0-3]\b(?=\s*(?:—|-|,|\.|$))/gi, "");
  body = body.replace(/\bL\s*[0-3]\s*\/\s*L\s*[0-3]\b/gi, "");
  body = body.replace(/\s*[\(\[｛【]\s*L\s*[0-3]\s*[\)\]｝】]/gi, "");
  body = body.replace(/\bGOLD_BAR\b/gi, "");
  body = body.replace(
    /\b(?:PROVISIONAL_(?:TOTAL|INSIGHT)_SCORE|EDITORIAL_DECISION|GATES_G1_G8)\b/gi,
    "",
  );

  // Collapse leftover empty punctuation / spaces from removals
  body = body.replace(/[ \t]{2,}/g, " ");
  body = body.replace(/ ?([,;:])\s*([,;:])/g, "$1");
  body = body.replace(/\(\s*\)/g, "");
  body = body.replace(/[ \t]+\n/g, "\n");
  return body.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Sanitize nháp / bản sạch trước khi lưu DB:
 * - không nhét Hero Brief vào cuối bài
 * - Title/Subtitle không mang (L2)
 */
export function sanitizeEditorialBody(content: string | null | undefined): string {
  if (!content?.trim()) return content ?? "";
  let body = stripHeroBriefSection(content);

  body = body.replace(/^(#{1,3}\s+)(.+)$/gm, (_, hashes: string, title: string) => {
    return `${hashes}${stripInsightLevelLabels(title)}`;
  });

  // Bản đăng: giữ nội dung phụ đề, bỏ nhãn "Subtitle:" / "Title:"
  body = body.replace(
    /^\*{0,2}Subtitle:\*{0,2}\s*(.+)$/gim,
    (_, sub: string) => `*${stripInsightLevelLabels(sub.trim())}*`,
  );
  body = body.replace(/^\*{0,2}Title:\*{0,2}\s*(.+)$/gim, (_, title: string) => {
    return `# ${stripInsightLevelLabels(title.trim())}`;
  });
  // Dòng chỉ có "Subtitle" / "Title" rồi nội dung dòng sau
  body = body.replace(/^\*{0,2}Subtitle\*{0,2}\s*$/gim, "");
  body = body.replace(/^\*{0,2}Title\*{0,2}\s*$/gim, "");

  // Encoding hỏng / replacement char
  body = body.replace(/\uFFFD/g, "");
  body = body.replace(/�+/g, "");

  // Placeholder hero sót chữ "alt" trần hoặc alt rỗng
  body = body.replace(/^\s*alt\s*$/gim, "");
  body = body.replace(/!\[(?:alt)?\]\(HERO_IMAGE\)/gi, "![Minh họa chủ đề bài](HERO_IMAGE)");

  // Light meta scrub on drafts (titles + known leak phrases); full scrub is reader-facing.
  body = body.replace(/\(\s*L\s*[0-3]\s*insight\s*\)/gi, "");
  body = body.replace(/\bL2 insight\b/gi, "insight");
  body = body.replace(/^\s*\*{0,2}Insight\s*L\s*[0-3]\s*:\s*/gim, "");
  body = body.replace(/\bInsight\s*L\s*[0-3]\s*:\s*/gi, "");

  return body.replace(/\n{3,}/g, "\n\n").trim();
}

/** Gỡ thematic break markdown (`---` / `***` / `___`) giữa các đoạn — bản đọc liền không dùng hr */
export function stripThematicBreaks(text: string): string {
  return text
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Bản sạch đăng tin: gỡ heading biên tập Article.md còn sót (tránh soft-retry vòng).
 * Giữ nội dung đoạn; chỉ bỏ/đổi tên heading.
 */
export function toReaderCleanPublish(content: string | null | undefined): string {
  if (!content?.trim()) return content ?? "";
  let body = sanitizeEditorialBody(content);
  body = stripReaderFacingMeta(body);

  body = body.replace(
    /^#{1,3}\s*(Introduction|Context|Problem Statement|Deep Analysis|Real-world Examples|Practical Recommendations|Executive Summary|Key Takeaways|Metadata)\b[^\n]*$/gim,
    "",
  );

  // Nhãn Section còn sót
  body = body.replace(/^\s*\*{0,2}Section\s*\d+\s*[:.-]\s*/gim, "");
  body = stripThematicBreaks(body);
  return body;
}

export function prepareReaderContent(
  content: string,
  options: { stripLeadingHeroImage?: boolean; stripHeroBriefSection?: boolean } = {},
) {
  const { stripLeadingHeroImage = true, stripHeroBriefSection: stripBrief = true } = options;
  let body = content;

  if (stripLeadingHeroImage) {
    body = body.replace(/^\s*!\[[^\]]*]\([^)]+\)\s*/m, "").trimStart();
  }

  if (stripBrief) {
    body = stripHeroBriefSection(body);
  }

  body = sanitizeEditorialBody(body);
  body = stripReaderFacingMeta(body);

  body = stripThematicBreaks(body);

  // Đảm bảo list markdown có dòng trống phía trước (CommonMark ổn định hơn)
  body = body.replace(/([^\n])\n([-*+] |\d+\. )/g, "$1\n\n$2");

  return body;
}
