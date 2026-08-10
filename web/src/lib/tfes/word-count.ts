/**
 * Đếm độ dài bài theo TỪ tiếng Việt thật.
 *
 * Hai khác biệt so với `split(/\s+/)` thô:
 * 1. Chỉ đếm văn xuôi độc giả đọc — bỏ hero image, code fence, References,
 *    Knowledge Record, URL, ký tự markdown.
 * 2. Tách khoảng trắng trong tiếng Việt cho ra TIẾNG (âm tiết), không phải TỪ:
 *    “cơ sở dữ liệu” là 1 từ nhưng 4 tiếng. Quy đổi qua `syllablesPerWord`.
 */

import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

const VI_DIACRITIC =
  /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

/** Dưới ngưỡng này coi như văn bản không phải tiếng Việt → 1 tiếng = 1 từ. */
const VI_TOKEN_SHARE_FLOOR = 0.15;

/** Heading mở đầu khối không tính vào độ dài văn xuôi. */
const NON_PROSE_HEADING =
  /^[ \t]*#{1,6}[ \t]*(references?|nguồn|nguồn tham khảo|tham khảo|knowledge record|ghi chú tri thức|further reading|đọc thêm)\b[^\n]*$/gim;

function dropNonProseSections(text: string): string {
  let out = text;
  for (;;) {
    NON_PROSE_HEADING.lastIndex = 0;
    const match = NON_PROSE_HEADING.exec(out);
    if (!match) return out;
    const start = match.index;
    const level = (match[0].match(/#/g) ?? []).length;
    const rest = out.slice(start + match[0].length);
    // Khối kết thúc ở heading cùng cấp hoặc cao hơn kế tiếp.
    const nextHeading = new RegExp(`^[ \\t]*#{1,${level}}[ \\t]+\\S`, "m").exec(rest);
    const end = nextHeading ? start + match[0].length + nextHeading.index : out.length;
    out = `${out.slice(0, start)}\n${out.slice(end)}`;
  }
}

/** Giữ lại chữ độc giả thật sự đọc; bỏ scaffolding markdown. */
export function extractProse(text: string | null | undefined): string {
  let body = text ?? "";
  if (!body.trim()) return "";

  body = body.replace(/<!--[\s\S]*?-->/g, " ");
  body = body.replace(/```[\s\S]*?```/g, " ");
  body = body.replace(/~~~[\s\S]*?~~~/g, " ");
  body = dropNonProseSections(body);

  body = body.replace(/!\[[^\]]*]\([^)]*\)/g, " ");
  body = body.replace(/\[([^\]]*)]\([^)]*\)/g, "$1");
  body = body.replace(/https?:\/\/\S+/gi, " ");

  body = body.replace(/^[ \t]*#{1,6}[ \t]*/gm, "");
  body = body.replace(/^[ \t]*>[ \t]?/gm, "");
  body = body.replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, "");
  body = body.replace(/^[ \t]*\|.*\|[ \t]*$/gm, " ");
  body = body.replace(/[`*_~]/g, "");

  return body;
}

/** Số TIẾNG (âm tiết) văn xuôi — đơn vị máy đếm được, dùng để nói với model. */
export function countProseSyllables(text: string | null | undefined): number {
  return extractProse(text)
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function syllablesPerWord(text: string): number {
  const ratio = PIPELINE_CONFIG.words.syllablesPerWord;
  const tokens = extractProse(text)
    .split(/\s+/)
    .filter((token) => /[\p{L}]/u.test(token));
  if (tokens.length < 20) return ratio;
  const viTokens = tokens.filter((token) => VI_DIACRITIC.test(token)).length;
  return viTokens / tokens.length < VI_TOKEN_SHARE_FLOOR ? 1 : ratio;
}

/** Số TỪ tiếng Việt thật — đơn vị biên tập viên nhập ở Settings / tạo bài. */
export function countProseWords(text: string | null | undefined): number {
  const body = text ?? "";
  const syllables = countProseSyllables(body);
  if (!syllables) return 0;
  return Math.round(syllables / syllablesPerWord(body));
}

/** Quy đổi target người nhập (từ) sang tiếng — chỉ để hướng dẫn model. */
export function wordsToSyllables(words: number): number {
  return Math.round(words * PIPELINE_CONFIG.words.syllablesPerWord);
}
