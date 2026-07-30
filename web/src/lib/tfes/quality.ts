/** Kiểm tra chất lượng theo AI-TFES Self-check / Quality Gates (máy, không tin model tự khai). */

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

export type QualityIssue = { code: string; message: string };

export function assertWritePhaseQuality(
  draft: string,
  phase: "a" | "b",
): void {
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
}): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const draft = input.draft12 ?? "";
  const clean = input.cleanPublish ?? "";
  const body = `${draft}\n${clean}`;
  const words = Math.max(countWords(draft), countWords(clean));

  if (words < 800) {
    issues.push({
      code: "LENGTH",
      message: `Độ dài chưa đủ (~${words} từ; mục tiêu ≥1.200 từ bản làm việc).`,
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

  if (!WHEN_NOT.test(body)) {
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

  if (!input.factCheck || input.factCheck.trim().length < 40) {
    issues.push({ code: "FACTCHECK", message: "Thiếu Fact-Check Ledger." });
  }

  const cleanWords = countWords(clean);
  if (cleanWords > 0 && cleanWords < 500) {
    issues.push({
      code: "CLEAN_SHORT",
      message: `Bản sạch quá ngắn (${cleanWords} từ).`,
    });
  }

  return issues;
}
