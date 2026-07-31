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
  body = body.replace(
    /^(\*{0,2}Subtitle:\*{0,2}\s*)(.+)$/gim,
    (_, label: string, sub: string) => `${label}${stripInsightLevelLabels(sub)}`,
  );
  body = body.replace(
    /^(\*{0,2}Title:\*{0,2}\s*)(.+)$/gim,
    (_, label: string, title: string) => `${label}${stripInsightLevelLabels(title)}`,
  );

  // Placeholder hero sót chữ "alt" trần hoặc alt rỗng
  body = body.replace(/^\s*alt\s*$/gim, "");
  body = body.replace(/!\[(?:alt)?\]\(HERO_IMAGE\)/gi, "![Minh họa chủ đề bài](HERO_IMAGE)");

  // Meta biên tập hay lọt vào body
  body = body.replace(/\(\s*L\s*[0-3]\s*insight\s*\)/gi, "");
  body = body.replace(/\bL2 insight\b/gi, "insight");

  return body.replace(/\n{3,}/g, "\n\n").trim();
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

  // Đảm bảo list markdown có dòng trống phía trước (CommonMark ổn định hơn)
  body = body.replace(/([^\n])\n([-*+] |\d+\. )/g, "$1\n\n$2");

  return body;
}
