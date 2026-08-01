/** Kiểm tra chất lượng theo AI-TFES Self-check / Quality Gates (máy, không tin model tự khai). */

import {
  EDITORIAL_HEADING_RE,
  hasAvoid,
  hasMarkdownTable,
  READER_HONESTY_RE,
  type WritingPrefs,
} from "@/lib/tfes/writing-prefs";
import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

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

/**
 * Khuôn mở bài “nhà máy” — chỉ các cụm hay lặp thật.
 * Tránh bắt quá rộng (“Trong một ngày…”, “công ty công nghệ” giữa bài).
 */
const STOCK_SCENE_OPENER =
  /Trong một\s+(?:sprint|cuộc họp|meeting|incident|on-?call|release|demo)\b|đội\s+(?:backend|frontend|platform|devops|SRE|product|engineering|eng)\s+của\s+một\s+công\s+ty|một\s+công\s+ty\s+(?:fintech|startup|e-?commerce)|công ty fintech|công ty startup/i;

const WHEN_NOT = /khi nào\s+KHÔNG|khi nào không nên|KHÔNG nên|không nên dùng|không phù hợp khi/i;

/** Outline blog marketing — bản đăng rời, không cuốn */
const LISTICLE_OUTLINE =
  /(?:^|\n)\s*#{0,3}\s*\d+\.\s*(Hook|Executive Summary|Khi nào nên|Khi nào không|Trade-?off|Decision Framework|Ví dụ thực tiễn|Kết luận)\b/i;

const BARE_ALT_LINE = /(?:^|\n)\s*alt\s*(?:\n|$)/i;
const BARE_SUBTITLE_LABEL = /(?:^|\n)\s*\*{0,2}Subtitle\*{0,2}\s*:?\s*(?:\n|$)/i;
const HANDBOOK_VOICE =
  /Cần áp dụng các biện pháp sau|Khuyến nghị thực tiễn\s*\n+(?:\s*[-*+]|\s*\d+\.)|được nhắc đến như một giải pháp|Khám phá các điều kiện|ngày càng phức tạp,\s*[“"]/i;
const DRY_OPENER =
  /^(?:#{1,3}[^\n]+\n+(?:\*[^\n]+\*\n+)?)?(?:Trong môi trường|Trong bối cảnh|Trong những năm|Không thể phủ nhận|Ngày nay,)/im;
const CONCRETE_SCENE =
  /(?:stage\s*\d|pipeline|snapshot|rollback|retry|incident|mất\s+(?:hàng\s+)?giờ|xuống\s+phút|failure\s*mode|node\s+(?:nào|gây)|họp\b|1:1|code\s*review|sprint|đồng nghiệp|stakeholder|hội thoại|ví dụ[:：])/i;

function countPercentClaims(text: string): number {
  const matches = text.match(/\d{1,3}\s*%/g) ?? [];
  return new Set(matches.map((m) => m.replace(/\s+/g, ""))).size;
}

/** Giữ tối đa `maxKeep` ngưỡng % khác nhau; phần thừa → wording định tính (thoát soft-retry vòng). */
export function softenExcessPercentClaims(text: string, maxKeep = 5): string {
  if (countPercentClaims(text) <= maxKeep) return text;
  const seen = new Set<string>();
  const soft = ["thường", "phần lớn trường hợp", "không ít", "một tỷ lệ đáng kể", "khá phổ biến"];
  let softIdx = 0;
  return text.replace(/\d{1,3}\s*%/g, (m) => {
    const key = m.replace(/\s+/g, "");
    if (!seen.has(key) && seen.size < maxKeep) {
      seen.add(key);
      return m;
    }
    const word = soft[softIdx % soft.length];
    softIdx += 1;
    return word;
  });
}

/** Đổi markdown table → bullet (thoát soft-retry khi prefs cấm table). */
export function stripMarkdownTablesToBullets(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const next = lines[i + 1] ?? "";
    const isTableStart =
      /^\s*\|.+\|\s*$/.test(line) &&
      (/^\s*\|?\s*:?-{3,}/.test(next) || /^\s*\|?\s*[-:| ]+\s*$/.test(next));
    if (!isTableStart) {
      out.push(line);
      i += 1;
      continue;
    }

    const tableRows: string[] = [];
    while (i < lines.length && /^\s*\|/.test(lines[i] ?? "")) {
      tableRows.push(lines[i] ?? "");
      i += 1;
    }
    for (const row of tableRows) {
      if (/^\s*\|?\s*[-:\s|]+\s*$/.test(row)) continue;
      const cells = row
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length === 0) continue;
      out.push(`- ${cells.join(" — ")}`);
    }
    out.push("");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Sửa máy các lỗi hay soft-retry vòng (table / % / --- / mermaid / Subtitle / opener khuôn). */
export function applyDeterministicCleanFixes(
  text: string,
  prefs?: WritingPrefs | null,
): string {
  let t = text;
  t = softenExcessPercentClaims(t, 5);
  if (!prefs || hasAvoid(prefs, "table") || hasMarkdownTable(t)) {
    // Prefs cấm table, hoặc vẫn còn table → luôn strip để thoát loop
    if (!prefs || hasAvoid(prefs, "table")) {
      t = stripMarkdownTablesToBullets(t);
    }
  }
  if (prefs && hasAvoid(prefs, "mermaid")) {
    t = t.replace(/```\s*mermaid[\s\S]*?```/gi, "");
  }
  t = t.replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "");
  t = t.replace(/^\*{0,2}Subtitle\*{0,2}\s*:?\s*$/gim, "");
  t = t.replace(/^\s*alt\s*$/gim, "");
  t = t.replace(/\uFFFD/g, "").replace(/�+/g, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  if (hasDryOpener(t)) {
    t = rewriteStockOpenerDeterministic(t);
  }
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export { countPercentClaims };

/** Lỗi thuộc bước Viết / nháp — soft-retry WRITE, không ép polish bản sạch. */
export const WRITE_PHASE_QUALITY_FAIL_RE =
  /Nháp|bước Viết|Bản 12 phần|BAR VIẾT|Chạy lại bước Viết|Chạy lại Viết|Gate < L2|nghiên cứu lại/i;

/**
 * Lỗi máy chấm bản sạch / self-check / Reader Sim — soft-retry + route polish.
 * Bao phủ assertCleanPublishQuality + editorialSelfCheck (clean) + Reader Sim.
 */
export const CLEAN_PUBLISH_QUALITY_FAIL_RE =
  /Bản sạch|Đoạn mở|khô\/giáo trình|mở khô|Self-check|Polish self-check|Reader Sim|ngưỡng %|heading biên tập|Introduction\/Context|handbook|brochure|mini-case|tình huống|Subtitle|gạch ngang|thematic break|listicle|outline|BAR VIẾT|sáo ngữ|Hook\/mở|khi nào không nên|điều kiện\/phản biện|không nên|không phù hợp|markdown table|\bTable\b|Mermaid|encoding|quá ngắn|quá dài|Rút gọn|dòng “?alt”?|placeholder hero|FACTCHECK|Fact-Check/i;

/** Lỗi gắn thân bài sạch — giữ cleanPublish, ép polish/repair (không FAILED). */
export const CLEAN_BODY_QUALITY_FAIL_RE =
  /Bản sạch|Đoạn mở|khô\/giáo trình|mở khô|heading biên tập|Introduction\/Context|điều kiện\/phản biện|không nên|không phù hợp|markdown table|\bTable\b|Mermaid|gạch ngang|thematic break|Subtitle|handbook|brochure|ngưỡng %|mini-case|tình huống|encoding|quá ngắn|quá dài|Rút gọn|dòng “?alt”?|placeholder hero|listicle|outline/i;

export function isWritePhaseQualityFail(message: string | null | undefined): boolean {
  return Boolean(message && WRITE_PHASE_QUALITY_FAIL_RE.test(message));
}

export function isCleanPublishQualityFail(message: string | null | undefined): boolean {
  if (!message) return false;
  // Self-check / Reader Sim luôn soft; còn lại loại trừ lỗi thuần bước Viết
  if (/Self-check|Polish self-check|Reader Sim/i.test(message)) return true;
  if (isWritePhaseQualityFail(message) && !/Bản sạch/i.test(message)) return false;
  return CLEAN_PUBLISH_QUALITY_FAIL_RE.test(message);
}

export function isCleanBodyQualityFail(message: string | null | undefined): boolean {
  if (!message) return false;
  if (isWritePhaseQualityFail(message) && !/Bản sạch/i.test(message)) return false;
  return CLEAN_BODY_QUALITY_FAIL_RE.test(message);
}

export function isDryOpenerFail(message: string | null | undefined): boolean {
  return Boolean(message && /Đoạn mở|khô\/giáo trình|mở khô|DRY_OPEN/i.test(message));
}

/** True nếu đoạn mở khô giáo trình HOẶC khuôn “sprint / đội X / công ty fintech”. */
export function hasDryOpener(clean: string): boolean {
  const openSample = openingBodySample(clean);
  return (
    DRY_OPENER.test(clean) ||
    /^(?:Trong môi trường|Trong bối cảnh)/m.test(openSample) ||
    STOCK_SCENE_OPENER.test(openSample)
  );
}

/** ~400 ký tự đầu thân bài (sau title / phụ đề / hero). */
function openingBodySample(clean: string): string {
  return clean
    .replace(/^#[^\n]+\n+/, "")
    .replace(/^\*[^\n]+\*\n+/, "")
    .replace(/^!\[[^\]]*\]\([^)]+\)\n+/, "")
    .replace(/^\s+/, "")
    .slice(0, 400);
}

/**
 * Sửa máy đoạn mở khuôn nhà máy / giáo trình — thoát soft-retry khi LLM không chịu đổi hook.
 * Thay đoạn văn đầu bằng nghịch lý neo title; giữ phần còn lại.
 */
export function rewriteStockOpenerDeterministic(clean: string): string {
  if (!hasDryOpener(clean)) return clean;

  const lines = clean.split("\n");
  const head: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const L = lines[i] ?? "";
    const t = L.trim();
    if (!t) {
      head.push(L);
      i += 1;
      continue;
    }
    if (/^#\s+/.test(t) || /^\*[^*].*\*$/.test(t) || /^!\[/.test(t)) {
      head.push(L);
      i += 1;
      continue;
    }
    break;
  }

  while (i < lines.length && !(lines[i] ?? "").trim()) {
    head.push(lines[i] ?? "");
    i += 1;
  }

  // Bỏ 1–2 đoạn mở đầu (thường chứa khuôn) — tối đa ~450 ký tự
  let dropped = 0;
  let dropBudget = 0;
  while (i < lines.length && dropBudget < 450 && dropped < 2) {
    const t = (lines[i] ?? "").trim();
    if (!t) {
      i += 1;
      continue;
    }
    if (/^#{1,3}\s/.test(t)) break;
    // một đoạn
    while (i < lines.length && (lines[i] ?? "").trim() && !/^#{1,3}\s/.test((lines[i] ?? "").trim())) {
      dropBudget += (lines[i] ?? "").length;
      i += 1;
    }
    dropped += 1;
    while (i < lines.length && !(lines[i] ?? "").trim()) i += 1;
  }

  const title = (clean.match(/^#\s+(.+)$/m)?.[1] || "").trim().replace(/\.$/, "");
  const subject = title || "Vấn đề này";
  const newOpen = `${subject} hiếm khi vỡ vì thiếu tool — thường vỡ vì một giả định vận hành bị coi là hiển nhiên đến mức không ai viết ra, cho đến khi sự cố buộc phải viết.`;

  const rest = lines.slice(i).join("\n").replace(/^\s+/, "");
  let next = `${head.join("\n").replace(/\s+$/, "")}\n\n${newOpen}\n\n${rest}`
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Nếu vẫn dính (hiếm) — prepend thêm câu an toàn ngay sau head
  if (hasDryOpener(next)) {
    next = `${head.join("\n").replace(/\s+$/, "")}\n\n${newOpen}\n\n${stripStockPhrasesFromOpening(rest)}`
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return next;
}

function stripStockPhrasesFromOpening(body: string): string {
  const sample = body.slice(0, 500);
  const fixed = sample
    .replace(/Trong một\s+(?:sprint|cuộc họp|meeting|incident|on-?call|release|demo)[^.?!\n]{0,80}[.?!]?/gi, "")
    .replace(/đội\s+(?:backend|frontend|platform|devops|SRE|product|engineering|eng)\s+của\s+một\s+công\s+ty[^.?!\n]{0,60}[.?!]?/gi, "")
    .replace(/một\s+công\s+ty\s+(?:fintech|startup|e-?commerce)/gi, "một hệ thống")
    .replace(/công ty fintech|công ty startup/gi, "hệ thống")
    .replace(/Trong môi trường[^.?!\n]{0,80}[.?!]?/gi, "")
    .replace(/Trong bối cảnh[^.?!\n]{0,80}[.?!]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return `${fixed}${body.slice(500)}`.replace(/^\s+/, "");
}

/**
 * Chỉ thị sửa cụ thể theo từng loại lỗi máy chấm — nhét vào finalize-repair.
 */
export function buildCleanRepairDirectives(
  hint: string,
  clean?: string,
): string {
  const lines: string[] = [];
  const h = hint;
  const body = clean ?? "";

  if (isDryOpenerFail(h) || (body && hasDryOpener(body))) {
    lines.push(
      "ƯU TIÊN — ĐOẠN MỞ (đổi khuôn, không chỉ đổi wording):",
      "- XÓA mở giáo trình: “Trong môi trường/bối cảnh/những năm…”, “Không thể phủ nhận”, “Ngày nay,”.",
      "- XÓA khuôn nhà máy: “Trong một sprint…”, “đội backend/frontend của một công ty fintech/startup…”.",
      "- Viết lại 1–3 câu đầu theo MỘT kiểu: nghịch lý vận hành · failure/metric cụ thể từ Research — CẤM invent “một công ty fintech/startup”.",
      "- CẤM thay bằng khuôn tương tự (“Trong một cuộc họp…”, “đội platform của một công ty…”).",
      "- Mini-case (nếu cần) đặt SAU mở luận điểm.",
    );
  }
  if (/handbook|brochure/i.test(h) || (body && HANDBOOK_VOICE.test(body))) {
    lines.push(
      "ƯU TIÊN — GIỌNG BLOG:",
      "- Bỏ checklist “Cần áp dụng các biện pháp sau”, brochure “được nhắc đến như một giải pháp”.",
      "- Viết đoạn có chủ ngữ (đội/lead/bạn), cảnh hoặc quyết định — như tin tức kỹ thuật.",
    );
  }
  if (/heading biên tập|Introduction|Context|Deep Analysis|EDITORIAL/i.test(h) || EDITORIAL_HEADING_RE.test(body)) {
    lines.push(
      "ƯU TIÊN — HEADING:",
      "- Đổi ## Introduction/Context/Deep Analysis/… thành heading tin tức (câu luận điểm, không nhãn biên tập).",
    );
  }
  if (/listicle|outline|Hook\/Khi nào|Framework/i.test(h) || LISTICLE_OUTLINE.test(body)) {
    lines.push(
      "ƯU TIÊN — BỎ LISTICLE:",
      "- Xóa outline đánh số Hook / Khi nào nên / Framework / Decision Framework.",
      "- Viết liền mạch theo ## luận điểm.",
    );
  }
  if (/table|Table|\|/i.test(h) || hasMarkdownTable(body)) {
    lines.push(
      "ƯU TIÊN — TABLE:",
      "- CẤM markdown table (|---|). Đổi thành đoạn hoặc bullet `- cột1 — cột2`.",
    );
  }
  if (/Mermaid/i.test(h) || /```\s*mermaid/i.test(body)) {
    lines.push("ƯU TIÊN — Bỏ mọi khối ```mermaid … ```; mô tả bằng đoạn văn.");
  }
  if (/ngưỡng %|STAT_SPAM|quá nhiều.*%/i.test(h) || countPercentClaims(body) >= 6) {
    lines.push(
      "ƯU TIÊN — SỐ %:",
      "- Giữ ≤5 ngưỡng % (ưu tiên số có trong Research/Fact); còn lại viết định tính (thường / phần lớn / khi…).",
    );
  }
  if (/mini-case|tình huống|NO_SCENE/i.test(h) || (body && !CONCRETE_SCENE.test(body))) {
    lines.push(
      "ƯU TIÊN — MINI-CASE:",
      "- Thêm ≥1 tình huống cụ thể (pipeline/stage/retry/snapshot/incident/họp/1:1…) với hậu quả hoặc quyết định.",
    );
  }
  if (/điều kiện\/phản biện|không nên|không phù hợp|WHEN_NOT|READER_HONESTY/i.test(h) || (body && !READER_HONESTY_RE.test(body))) {
    lines.push(
      "ƯU TIÊN — PHẢN BIỆN:",
      "- Thêm rõ điều kiện không áp dụng (không nên / chỉ khi / không phù hợp khi…).",
    );
  }
  if (/khi nào không nên.*≥3|WHEN_NOT_REPEAT|≥3 khối/i.test(h)) {
    lines.push(
      "ƯU TIÊN — GỘP “khi nào không nên”: chỉ còn MỘT khối/đoạn; xóa các lần lặp.",
    );
  }
  if (/Subtitle/i.test(h) || BARE_SUBTITLE_LABEL.test(body)) {
    lines.push("ƯU TIÊN — Xóa mọi nhãn Subtitle; chỉ giữ 1 dòng *phụ đề nghiêng* dưới # Title.");
  }
  if (/\balt\b|placeholder hero/i.test(h) || BARE_ALT_LINE.test(body)) {
    lines.push("ƯU TIÊN — Xóa dòng chỉ có “alt”; dùng ![mô tả ngắn](HERO_IMAGE) nếu cần.");
  }
  if (/gạch ngang|thematic break|---/i.test(h) || /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m.test(body)) {
    lines.push("ƯU TIÊN — Xóa mọi dòng --- / *** / ___ giữa nội dung; nối đoạn.");
  }
  if (/encoding|�/i.test(h) || /\uFFFD|�/.test(body)) {
    lines.push("ƯU TIÊN — Xóa/sửa ký tự encoding lỗi (�).");
  }
  if (/quá ngắn|CLEAN_SHORT/i.test(h)) {
    lines.push(
      "ƯU TIÊN — ĐỘ DÀI: viết thêm thân bài (ví dụ, trade-off, hậu quả) — không rút synopsis; đủ sàn WRITING PREFS.",
    );
  }
  if (/quá dài|Rút gọn/i.test(h)) {
    lines.push(
      "ƯU TIÊN — RÚT GỌN: cắt lặp / checklist; giữ luận điểm + 1 mini-case; dưới trần WRITING PREFS.",
    );
  }

  if (lines.length === 0) {
    lines.push(
      "Sửa đúng lỗi máy chấm ở trên; giữ luận điểm/title; giọng blog/tin tức kỹ thuật.",
    );
  }
  return lines.join("\n");
}

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
  if (phase === "a" && (SLOP_OPENERS.test(draft.slice(0, 800)) || STOCK_SCENE_OPENER.test(draft.slice(0, 800)))) {
    throw new Error(
      "Mở bài kiểu sáo ngữ hoặc khuôn “sprint/đội fintech” (cấm theo BAR VIẾT). Chạy lại bước Viết với hook cụ thể từ Research.",
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

/** Sàn / trần từ bản sạch theo WRITING PREFS (target mặc định 1200).
 * Đếm TỪ = tách khoảng trắng (tiếng Việt), KHÔNG đếm ký tự. */
export function cleanWordBounds(prefs?: WritingPrefs | null): {
  target: number;
  minWords: number;
  /** Ngưỡng “gần target” — dưới mức này sẽ expand thêm trước khi chấm */
  aimWords: number;
  maxWords: number;
} {
  const { words } = PIPELINE_CONFIG;
  const target = prefs?.targetWordCount ?? words.defaultTarget;
  const minWords = Math.max(450, Math.round(target * words.cleanMinRatio));
  const aimWords = Math.max(minWords, Math.round(target * words.cleanAimRatio));
  const maxWords = Math.round(target * words.cleanMaxRatio) + words.cleanMaxBuffer;
  return { target, minWords, aimWords, maxWords };
}

/** max_tokens completion cho Publish/Polish/Expand — tỷ lệ theo target (reasoning model ăn budget). */
export function cleanGenMaxTokens(targetWordCount?: number | null): number {
  const { words, llm } = PIPELINE_CONFIG;
  const target = targetWordCount && targetWordCount > 0 ? targetWordCount : words.defaultTarget;
  return Math.min(
    llm.cleanMaxTokensCap,
    Math.max(llm.cleanMaxTokensFloor, Math.round(target * llm.cleanTokensPerWord) + llm.cleanTokensExtra),
  );
}

/** Bản sạch Publish Ready — bài đọc liền trước khi PUBLISH_READY */
export function assertCleanPublishQuality(
  clean: string,
  prefs?: WritingPrefs | null,
): void {
  const words = countWords(clean);
  const { target, minWords, maxWords } = cleanWordBounds(prefs);

  if (words < minWords) {
    throw new Error(
      `Bản sạch quá ngắn (${words} từ đếm khoảng trắng, cần ≥${minWords} theo target ~${target} từ — không phải ký tự). Viết thêm thân bài cho đủ.`,
    );
  }
  if (words > maxWords) {
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
  if (BARE_SUBTITLE_LABEL.test(clean)) {
    throw new Error(
      'Bản sạch còn nhãn “Subtitle” — chỉ giữ phụ đề in nghiêng dưới # Title, không viết chữ Subtitle.',
    );
  }
  if (/\uFFFD|�/.test(clean)) {
    throw new Error("Bản sạch còn ký tự encoding lỗi (�) — chạy lại Polish.");
  }
  if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/m.test(clean)) {
    throw new Error("Bản sạch còn dòng gạch ngang (---) giữa nội dung — bỏ thematic break, nối đoạn.");
  }
  if (HANDBOOK_VOICE.test(clean)) {
    throw new Error(
      "Bản sạch còn giọng handbook/brochure — viết lại như blog/tin tức (cảnh mở + người/đội, không “ngày càng phức tạp… được nhắc đến như”).",
    );
  }
  // Chỉ soi ~600 ký tự đầu body (sau title/phụ đề) — prefix “Bản sạch” để soft-retry nhận diện
  if (hasDryOpener(clean)) {
    throw new Error(
      "Bản sạch: đoạn mở còn khô/giáo trình hoặc khuôn “sprint / đội X / công ty fintech” — đổi sang nghịch lý hoặc failure cụ thể từ Research (xem gold_samples).",
    );
  }
  if (countPercentClaims(clean) >= 6) {
    throw new Error(
      "Bản sạch có quá nhiều ngưỡng % cụ thể (≥6) — dễ bịa; giữ ≤5 số có trong Research hoặc viết định tính.",
    );
  }
  if (!CONCRETE_SCENE.test(clean)) {
    throw new Error(
      "Bản sạch thiếu tình huống cụ thể (pipeline/stage/retry/snapshot…) — thêm ≥1 mini-case trước khi Publish Ready.",
    );
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

  if (
    SLOP_OPENERS.test((clean || draft).slice(0, 600)) ||
    STOCK_SCENE_OPENER.test((clean || draft).slice(0, 600))
  ) {
    issues.push({
      code: "HOOK",
      message:
        "Hook/mở bài còn sáo ngữ hoặc khuôn “sprint / đội công ty fintech” — chưa đạt BAR VIẾT.",
    });
  }

  if (LISTICLE_OUTLINE.test(draft) || LISTICLE_OUTLINE.test(clean)) {
    issues.push({
      code: "LISTICLE",
      message: "Bản sạch còn outline listicle (Hook/Khi nào nên/Framework…) — bản đăng phải liền mạch.",
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
      message: "Bản sạch còn markdown table trong khi prefs tránh Table.",
    });
  }

  if (prefs && hasAvoid(prefs, "mermaid") && /```\s*mermaid/i.test(clean || draft)) {
    issues.push({
      code: "AVOID_MERMAID",
      message: "Bản sạch còn Mermaid trong khi prefs tránh.",
    });
  }

  if (countWhenNotBlocks(body) >= 3) {
    issues.push({
      code: "WHEN_NOT_REPEAT",
      message:
        "Bản sạch có ≥3 khối/heading “khi nào không nên” riêng — gộp một lần trong Recommendations.",
    });
  }

  if (BARE_ALT_LINE.test(body)) {
    issues.push({
      code: "BARE_ALT",
      message: "Bản sạch còn dòng “alt” sót từ placeholder hero.",
    });
  }

  if (clean.trim() && BARE_SUBTITLE_LABEL.test(clean)) {
    issues.push({
      code: "SUBTITLE_LABEL",
      message: "Bản sạch còn nhãn Subtitle — chỉ giữ phụ đề in nghiêng.",
    });
  }

  if (clean.trim() && HANDBOOK_VOICE.test(clean)) {
    issues.push({
      code: "HANDBOOK",
      message: "Bản sạch còn giọng handbook/brochure — viết lại như blog/tin tức kỹ thuật.",
    });
  }

  if (clean.trim() && hasDryOpener(clean)) {
    issues.push({
      code: "DRY_OPEN",
      message: "Bản sạch: đoạn mở khô/giáo trình — cần cảnh hoặc nghịch lý như blog.",
    });
  }

  if (clean.trim() && countPercentClaims(clean) >= 6) {
    issues.push({
      code: "STAT_SPAM",
      message: "Bản sạch có quá nhiều ngưỡng % cụ thể — dễ bịa; bớt số hoặc khớp Research.",
    });
  }

  if (clean.trim() && !CONCRETE_SCENE.test(clean)) {
    issues.push({
      code: "NO_SCENE",
      message: "Bản sạch thiếu mini-case / tình huống kỹ thuật cụ thể.",
    });
  }

  if (!input.factCheck || input.factCheck.trim().length < 40) {
    issues.push({ code: "FACTCHECK", message: "Thiếu Fact-Check Ledger." });
  }

  const cleanWords = countWords(clean);
  const { minWords } = cleanWordBounds(prefs);
  // Soft gate nhẹ hơn assert (½ sàn) — tránh self-check loop khi polish gần đạt
  if (cleanWords > 0 && cleanWords < Math.max(350, Math.round(minWords * 0.55))) {
    issues.push({
      code: "CLEAN_SHORT",
      message: `Bản sạch quá ngắn (${cleanWords} từ; target ~${target}, sàn ~${minWords}).`,
    });
  }

  return issues;
}
