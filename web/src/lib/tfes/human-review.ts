import {
  extractEditorialReview,
  HUMAN_REVIEW_DONE_MARK,
  HUMAN_REVIEW_HEADING,
  HUMAN_REVIEW_PENDING_MARK,
  REVIEW_DONE_MARK,
  stripPipelineMarks,
} from "@/lib/tfes/parser";

export type HumanReviewDisposition = "fixed" | "accept";

export type EditorialFinding = {
  id: string;
  label: string;
  severity: "fail" | "revision" | "decision";
};

export type HumanReviewItem = {
  id: string;
  disposition: HumanReviewDisposition;
  note?: string;
};

export type HumanReviewPayload = {
  items: HumanReviewItem[];
  notes?: string;
  at?: string;
};

function slugId(raw: string, prefix: string): string {
  const base = raw
    .toLowerCase()
    .replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `${prefix}-${base || "item"}`;
}

/**
 * Trích Fail / Required Revisions / kết luận Minor–Major–Rewrite từ Editorial Review AI.
 */
export function parseEditorialFindings(
  knowledgeRecord: string | null | undefined,
): EditorialFinding[] {
  const review = extractEditorialReview(knowledgeRecord);
  if (!review.trim()) return [];

  const findings: EditorialFinding[] = [];
  const seen = new Set<string>();

  const push = (finding: EditorialFinding) => {
    if (seen.has(finding.id)) return;
    seen.add(finding.id);
    findings.push(finding);
  };

  // G1–G8 / N1–N6 marked Fail (checkbox hoặc dòng chữ)
  const gateRe =
    /(?:^|\n)\s*(?:[-*]\s*)?(?:\[[ xX]\]\s*)?((?:G|N)\d+)\s*([^|\n]*?)(?:\bFail\b|\bFAIL\b)/gi;
  let m: RegExpExecArray | null;
  while ((m = gateRe.exec(review))) {
    const code = m[1].toUpperCase();
    const rest = m[2].replace(/\s+/g, " ").trim().slice(0, 80);
    push({
      id: slugId(code, "gate"),
      label: rest ? `${code}: ${rest}` : `${code} — Fail`,
      severity: "fail",
    });
  }

  // Table rows / bullets with Fail (không trùng gate đã bắt)
  for (const line of review.split(/\n/)) {
    const t = line.trim();
    if (!t || !/\bfail\b/i.test(t)) continue;
    if (/\bpass\b/i.test(t) && !/\bfail\b/i.test(t.replace(/\bpass\b/gi, ""))) continue;
    if (/^(?:\|?\s*-+\s*)+\|?$/.test(t)) continue;
    const cleaned = t
      .replace(/^\|/, "")
      .replace(/\|$/g, "")
      .replace(/\s*\|\s*/g, " · ")
      .replace(/^[-*]\s*(?:\[[ xX]\]\s*)?/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    if (cleaned.length < 8) continue;
    if (/^(?:dimension|trọng|ghi chú)/i.test(cleaned)) continue;
    const codeMatch = cleaned.match(/\b((?:G|N)\d+)\b/i);
    if (codeMatch && seen.has(slugId(codeMatch[1], "gate"))) continue;
    push({
      id: slugId(cleaned, "fail"),
      label: cleaned,
      severity: "fail",
    });
  }

  // Required Revisions
  const revMatch = review.match(
    /Required\s*Revisions?\s*[:：]\s*([^\n]+)|Yêu cầu sửa\s*[:：]\s*([^\n]+)/i,
  );
  const revText = (revMatch?.[1] || revMatch?.[2] || "").trim();
  if (revText && revText.length > 3 && !/^<?>$/.test(revText)) {
    push({
      id: "required-revisions",
      label: `Required Revisions: ${revText.slice(0, 160)}`,
      severity: "revision",
    });
  }

  // Decision line
  const decisionMatch = review.match(
    /\*\*Kết luận:\*\*\s*([^—\n]+)|Kết luận\s*[:：]\s*([^—\n]+)/i,
  );
  const decision = (decisionMatch?.[1] || decisionMatch?.[2] || "").trim();
  if (/rewrite|major\s*revision|minor\s*revision/i.test(decision)) {
    push({
      id: "decision",
      label: `Kết luận AI: ${decision.slice(0, 100)}`,
      severity: "decision",
    });
  } else if (/rewrite|major\s*revision/i.test(review) && !findings.some((f) => f.id === "decision")) {
    const soft = review.match(/\b(Rewrite|Major Revision|Minor Revision)\b/i);
    if (soft) {
      push({
        id: "decision",
        label: `Kết luận AI: ${soft[1]}`,
        severity: "decision",
      });
    }
  }

  // Fallback: nếu AI ghi Fail chung nhưng parser không bắt được dòng cụ thể
  if (findings.length === 0 && /\bfail\b|major\s*revision|rewrite/i.test(review)) {
    push({
      id: "review-summary",
      label: "Review AI có Fail / Revision — đọc tab Review và xác nhận từng điểm",
      severity: "revision",
    });
  }

  return findings.slice(0, 16);
}

/** Review AI xong, chưa Fact-check, chưa có HUMAN_REVIEW_DONE → chờ người. */
export function isAwaitingHumanReview(article: {
  knowledgeRecord?: string | null;
  factCheck?: string | null;
}): boolean {
  const kr = article.knowledgeRecord ?? "";
  if (!kr.includes(REVIEW_DONE_MARK)) return false;
  if (kr.includes(HUMAN_REVIEW_DONE_MARK)) return false;
  if ((article.factCheck ?? "").trim()) return false;
  return true;
}

export function extractHumanReviewSection(
  knowledgeRecord: string | null | undefined,
): string {
  const raw = knowledgeRecord ?? "";
  const m = raw.match(
    new RegExp(
      `${HUMAN_REVIEW_HEADING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*([\\s\\S]*?)(?=\\n##\\s|\\n<!--TFES_|$)`,
      "i",
    ),
  );
  return m?.[1]?.trim() ?? "";
}

export function formatHumanReviewBlock(payload: HumanReviewPayload, findings: EditorialFinding[]): string {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const lines = payload.items.map((item) => {
    const label = byId.get(item.id)?.label ?? item.id;
    const disp = item.disposition === "fixed" ? "đã sửa" : "chấp nhận rủi ro";
    const note = item.note?.trim() ? ` — ${item.note.trim()}` : "";
    return `- [${item.id}] ${disp}: ${label}${note}`;
  });
  const notes = payload.notes?.trim()
    ? `\n\nGhi chú biên tập:\n${payload.notes.trim()}`
    : "";
  const at = payload.at ? `\n\n_Xác nhận lúc ${payload.at}_` : "";
  return `${HUMAN_REVIEW_HEADING}\n${lines.join("\n") || "- (không có Fail cụ thể — người đã đọc Review AI)"}${notes}${at}`;
}

/** Gắn HUMAN_REVIEW_DONE + section; bỏ PENDING. */
export function applyHumanReviewToKnowledge(
  knowledgeRecord: string | null | undefined,
  payload: HumanReviewPayload,
  findings: EditorialFinding[],
): string {
  const raw = (knowledgeRecord ?? "")
    .replaceAll(HUMAN_REVIEW_PENDING_MARK, "")
    .replaceAll(HUMAN_REVIEW_DONE_MARK, "")
    .replace(
      new RegExp(`\\n*${HUMAN_REVIEW_HEADING.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?(?=\\n##\\s|\\n<!--TFES_|$)`, "i"),
      "",
    )
    .trim();

  const block = formatHumanReviewBlock(
    { ...payload, at: payload.at ?? new Date().toISOString() },
    findings,
  );

  const withReviewMark = raw.includes(REVIEW_DONE_MARK)
    ? raw
    : `${raw}\n\n${REVIEW_DONE_MARK}`;

  return `${withReviewMark}\n\n${HUMAN_REVIEW_DONE_MARK}\n\n${block}`.trim();
}

export function withHumanReviewPendingMark(knowledgeRecord: string): string {
  const cleaned = knowledgeRecord
    .replaceAll(HUMAN_REVIEW_PENDING_MARK, "")
    .replaceAll(HUMAN_REVIEW_DONE_MARK, "")
    .trim();
  const base = cleaned.includes(REVIEW_DONE_MARK)
    ? cleaned
    : `${cleaned}\n\n${REVIEW_DONE_MARK}`;
  return `${base}\n${HUMAN_REVIEW_PENDING_MARK}`.trim();
}

/** Context cho Fact / Polish — ưu tiên ghi chú người. */
export function humanReviewSupportBlock(
  knowledgeRecord: string | null | undefined,
): string {
  const section = extractHumanReviewSection(knowledgeRecord);
  if (!section.trim()) return "";
  return `### Human Review (biên tập viên) — ưu tiên hơn AI Review khi mâu thuẫn\n${stripPipelineMarks(section).slice(0, 1_600)}`;
}
