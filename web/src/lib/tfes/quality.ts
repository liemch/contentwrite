/** Kiểm tra chất lượng theo AI-TFES Self-check / Quality Gates (máy, không tin model tự khai). */

import {
  EDITORIAL_HEADING_RE,
  hasAvoid,
  hasMarkdownTable,
  READER_HONESTY_RE,
  type WritingPrefs,
} from "@/lib/tfes/writing-prefs";

export function countWords(text: string | null | undefined): number {
  const t = (text ?? "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

export function hasHttpLink(text: string | null | undefined): boolean {
  return /https?:\/\/\S+/i.test(text ?? "");
}

const FAKE_COMPANY =
  /Công ty\s+(ABC|DEF|XYZ)|Company\s+(ABC|DEF|XYZ)|tạp chí Công nghệ|Học viện Công nghệ(?!\s+\w)/i;

const SLOP_OPENERS =
  /Trong (thế giới|những năm gần đây|thời đại ngày nay)|không thể phủ nhận|đóng vai trò quan trọng|là một yếu tố quan trọng/i;

const WHEN_NOT = /khi nào\s+KHÔNG|khi nào không nên|KHÔNG nên|không nên dùng|không phù hợp khi/i;

/** Outline blog marketing — bản đăng rời, không cuốn */
const LISTICLE_OUTLINE =
  /(?:^|\n)\s*#{0,3}\s*\d+\.\s*(Hook|Executive Summary|Khi nào nên|Khi nào không|Trade-?off|Decision Framework|Ví dụ thực tiễn|Kết luận)\b/i;

const BARE_ALT_LINE = /(?:^|\n)\s*alt\s*(?:\n|$)/i;

export type QualityIssue = { code: string; message: string };

/**
 * Đếm khối/heading dành riêng cho “khi nào KHÔNG” — không đếm mọi lần nhắc trong bài
 * (chủ đề kiểu “Khi nào nên dùng…” dễ có 5+ cụm từ bình thường).
 */
function countWhenNotBlocks(text: string): number {
  const heading =
    text.match(/^#{1,3}\s+[^\n]*(khi nào\s+không|không nên dùng|when not to)[^\n]*$/gim) ??
    [];
  const labeled =
    text.match(/(?:^|\n)\s*(?:\*\*)?Khi nào không nên(?:\*\*)?\s*[:：]/gi) ?? [];
  const numberedWhenNot =
    text.match(/(?:^|\n)\s*\d+\.\s*Khi nào (?:không|KHÔNG)[^\n]{0,80}/g) ?? [];
  return heading.length + labeled.length + numberedWhenNot.length;
}

export function assertWritePhaseQuality(draft: string, phase: "a" | "b"): void {
  const words = countWords(draft);
  if (phase === "a" && words < 450) {
    throw new Error(
      `Nháp nửa đầu quá ngắn (${words} từ, cần ≥450). Chạy lại bước Viết — model phải viết sâu hơn theo BAR VIẾT.`,
    );
  }
  if (phase === "b" && words < 350) {
    throw new Error(
      `Nháp nửa sau quá ngắn (${words} từ, cần ≥350). Chạy lại bước Viết.`,
    );
  }
  if (FAKE_COMPANY.test(draft)) {
    throw new Error(
      "Phát hiện ví dụ/ công ty giả (ABC/DEF/XYZ) hoặc reference nghi bịa. Chạy lại bước Viết với tình huống kỹ thuật cụ thể từ Research.",
    );
  }
  if (phase === "a" && SLOP_OPENERS.test(draft.slice(0, 800))) {
    throw new Error(
      "Mở bài kiểu sáo ngữ (cấm theo BAR VIẾT). Chạy lại bước Viết với hook cụ thể.",
    );
  }
  if (LISTICLE_OUTLINE.test(draft)) {
    throw new Error(
      "Nháp còn outline listicle (1. Hook / Khi nào nên / Framework…). Viết lại theo heading Article.md, liền mạch.",
    );
  }
}

export function assertFullDraftQuality(draft: string): void {
  const words = countWords(draft);
  if (words < 900) {
    throw new Error(
      `Bản 12 phần quá ngắn (${words} từ, AI-TFES yêu cầu ~1.200–1.800). Chạy lại Viết hoặc Reset.`,
    );
  }
  if (!WHEN_NOT.test(draft)) {
    throw new Error(
      'Thiếu mục “khi nào KHÔNG nên” / phản biện thật (Self-check AI-TFES). Chạy lại bước Viết (nửa sau).',
    );
  }
  if (FAKE_COMPANY.test(draft)) {
    throw new Error("Ví dụ/reference nghi bịa trong bản nháp. Chạy lại Viết.");
  }
  if (LISTICLE_OUTLINE.test(draft)) {
    throw new Error(
      "Nháp còn outline listicle (1. Hook / Khi nào nên / Framework…). Viết lại theo heading Article.md, liền mạch.",
    );
  }
  if (countWhenNotBlocks(draft) >= 3) {
    throw new Error(
      "Có ≥3 khối/heading “khi nào không nên” riêng — gộp một lần trong Recommendations rồi viết tiếp.",
    );
  }
}

/** Bản sạch Publish Ready — bài đọc liền trước khi PUBLISH_READY */
export function assertCleanPublishQuality(
  clean: string,
  prefs?: WritingPrefs | null,
): void {
  const words = countWords(clean);
  const target = prefs?.targetWordCount ?? 1200;
  const minWords = Math.max(500, Math.round(target * 0.75));
  const maxWords = Math.round(target * 1.35);

  if (words < minWords) {
    throw new Error(
      `Bản sạch quá ngắn (${words} từ, cần ≥${minWords} theo target ~${target}). Viết lại bài đọc liền.`,
    );
  }
  if (words > maxWords + 200) {
    throw new Error(
      `Bản sạch quá dài (${words} từ, target ~${target}, trần ~${maxWords}). Rút gọn bản đăng.`,
    );
  }
  if (EDITORIAL_HEADING_RE.test(clean)) {
    throw new Error(
      "Bản sạch còn heading biên tập (Introduction/Context/Deep Analysis…). Viết lại dạng tin đọc liền.",
    );
  }
  if (LISTICLE_OUTLINE.test(clean)) {
    throw new Error(
      "Bản sạch còn outline listicle — viết lại bài đọc liền (không checklist).",
    );
  }
  if (prefs && hasAvoid(prefs, "table") && hasMarkdownTable(clean)) {
    throw new Error("Bản sạch còn markdown table — prefs yêu cầu tránh Table; dùng đoạn/bullet.");
  }
  if (prefs && hasAvoid(prefs, "mermaid") && /```\s*mermaid/i.test(clean)) {
    throw new Error("Bản sạch còn Mermaid — prefs yêu cầu tránh.");
  }
  if (countWhenNotBlocks(clean) >= 3) {
    throw new Error(
      "Bản sạch có ≥3 khối “khi nào không nên” — gộp một lần rồi viết tiếp.",
    );
  }
  if (BARE_ALT_LINE.test(clean)) {
    throw new Error('Bản sạch còn dòng “alt” sót — dùng ![mô tả ngắn](HERO_IMAGE).');
  }
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m.test(clean)) {
    throw new Error("Bản sạch còn dòng gạch ngang (---) giữa nội dung — bỏ thematic break, nối đoạn.");
  }
  if (!READER_HONESTY_RE.test(clean)) {
    throw new Error(
      'Bản sạch thiếu điều kiện/phản biện (vd. “không nên”, “chỉ khi”, “không phù hợp”).',
    );
  }
}

/**
 * Self-check trước Publish Ready (Operating Prompt mục 8).
 * Trả về danh sách lỗi — rỗng = đạt.
 */
export function editorialSelfCheck(input: {
  researchBrief?: string | null;
  insightGate?: string | null;
  draft12?: string | null;
  cleanPublish?: string | null;
  factCheck?: string | null;
  writingPrefs?: WritingPrefs | null;
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const draft = input.draft12 ?? "";
  const clean = input.cleanPublish ?? "";
  const prefs = input.writingPrefs;
  const body = `${draft}\n${clean}`;
  const words = Math.max(countWords(draft), countWords(clean));
  const target = prefs?.targetWordCount ?? 1200;

  if (words < 800) {
    issues.push({
      code: "LENGTH",
      message: `Độ dài chưa đủ (~${words} từ; mục tiêu ≥${Math.round(target * 0.75)}).`,
    });
  }

  if (!input.insightGate || input.insightGate.trim().length < 80) {
    issues.push({ code: "INSIGHT", message: "Thiếu Insight Gate result." });
  } else if (
    /(?:cấp|level|xếp hạng)\s*[:=]?\s*L[01]\b/i.test(input.insightGate) &&
    !/\bL[23]\b/.test(input.insightGate)
  ) {
    issues.push({ code: "INSIGHT_LEVEL", message: "Insight Gate có vẻ < L2." });
  }

  if (!WHEN_NOT.test(draft) && !READER_HONESTY_RE.test(clean || draft)) {
    issues.push({
      code: "WHEN_NOT",
      message: "Thiếu “khi nào KHÔNG nên” / điều kiện không áp dụng.",
    });
  }

  if (!hasHttpLink(input.researchBrief) && !hasHttpLink(body)) {
    issues.push({
      code: "SOURCES",
      message: "Không thấy URL nguồn thật trong Research/bài (Evidence First).",
    });
  }

  if (FAKE_COMPANY.test(body)) {
    issues.push({
      code: "FAKE_EXAMPLES",
      message: "Ví dụ/reference nghi bịa (ABC/DEF hoặc nguồn giả).",
    });
  }

  if (SLOP_OPENERS.test((clean || draft).slice(0, 600))) {
    issues.push({
      code: "HOOK",
      message: "Hook/mở bài còn sáo ngữ — chưa đạt BAR VIẾT.",
    });
  }

  // Listicle trên nháp vẫn bắt; trên bản sạch luôn bắt
  if (LISTICLE_OUTLINE.test(draft) || LISTICLE_OUTLINE.test(clean)) {
    issues.push({
      code: "LISTICLE",
      message: "Còn outline listicle (Hook/Khi nào nên/Framework…) — bản đăng phải liền mạch.",
    });
  }

  if (clean.trim() && EDITORIAL_HEADING_RE.test(clean)) {
    issues.push({
      code: "EDITORIAL_HEADINGS",
      message:
        "Bản sạch còn heading biên tập (Introduction/Context/…) — cần dạng tin đọc liền.",
    });
  }

  if (prefs && hasAvoid(prefs, "table") && hasMarkdownTable(clean || draft)) {
    issues.push({
      code: "AVOID_TABLE",
      message: "Còn markdown table trong khi prefs tránh Table.",
    });
  }

  if (prefs && hasAvoid(prefs, "mermaid") && /```\s*mermaid/i.test(clean || draft)) {
    issues.push({
      code: "AVOID_MERMAID",
      message: "Còn Mermaid trong khi prefs tránh.",
    });
  }

  if (countWhenNotBlocks(body) >= 3) {
    issues.push({
      code: "WHEN_NOT_REPEAT",
      message:
        "Có ≥3 khối/heading “khi nào không nên” riêng — gộp một lần trong Recommendations.",
    });
  }

  if (BARE_ALT_LINE.test(body)) {
    issues.push({
      code: "BARE_ALT",
      message: "Còn dòng “alt” sót từ placeholder hero.",
    });
  }

  if (!input.factCheck || input.factCheck.trim().length < 40) {
    issues.push({ code: "FACTCHECK", message: "Thiếu Fact-Check Ledger." });
  }

  const cleanWords = countWords(clean);
  if (cleanWords > 0 && cleanWords < Math.max(400, Math.round(target * 0.5))) {
    issues.push({
      code: "CLEAN_SHORT",
      message: `Bản sạch quá ngắn (${cleanWords} từ; target ~${target}).`,
    });
  }

  return issues;
}
