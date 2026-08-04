/**
 * Phase 1 — Chuẩn vàng Engineering (anti-generic + tính thực tế).
 * Heuristic deterministic; chỉ áp dụng khi domain = engineering.
 */

import { resolveDomainId } from "@/lib/tfes/domains";

export const GOLD_BAR_PREFIX = "GOLD_BAR:";

export type GoldBarCheckId =
  | "GENERIC_OPENER"
  | "NO_CONCRETE_SCENE"
  | "NO_WHEN_NOT"
  | "HANDBOOK_VOICE"
  | "UNGROUNDED_SCENE"
  | "ADVICE_WITHOUT_CONDITIONS";

export type GoldBarFailure = {
  id: GoldBarCheckId;
  message: string;
};

export type GoldBarResult = {
  ok: boolean;
  applicable: boolean;
  failures: GoldBarFailure[];
};

const GENERIC_OPENER_RE =
  /^(?:#{1,3}[^\n]+\n+(?:\*[^\n]+\*\n+)?)?(?:Trong môi trường|Trong bối cảnh|Trong những năm|Không thể phủ nhận|Ngày nay[,:]|ngày càng phức tạp)/im;

const STOCK_SCENE_OPENER =
  /Trong một\s+(?:sprint|cuộc họp|meeting|incident|on-?call|release|demo)\b|đội\s+(?:backend|frontend|platform|devops|SRE|product|engineering|eng)\s+của\s+một\s+công\s+ty|một\s+công\s+ty\s+(?:fintech|startup|e-?commerce)|công ty fintech|công ty startup/i;

const SLOP_OPENERS =
  /Trong (thế giới|những năm gần đây|thời đại ngày nay)|không thể phủ nhận|đóng vai trò quan trọng|là một yếu tố quan trọng/i;

const WHEN_NOT =
  /khi nào\s+KHÔNG|khi nào không nên|KHÔNG nên|không nên dùng|không phù hợp khi/i;

const HANDBOOK_VOICE =
  /Cần áp dụng các biện pháp sau|Khuyến nghị thực tiễn\s*\n+(?:\s*[-*+]|\s*\d+\.)|được nhắc đến như một giải pháp|Khám phá các điều kiện|ngày càng phức tạp,\s*[“"]|Các bước thực hiện như sau|Dưới đây là các nguyên tắc/i;

/** Cụm vận hành / kỹ thuật cụ thể */
const OPS_SCENE =
  /(?:stage\s*\d|pipeline|snapshot|rollback|retry|incident|on-?call|latency|p99|timeout|deploy|canary|feature\s*flag|ADR|observability|cardinality|dashboard|alert|outage|mất\s+(?:hàng\s+)?giờ|xuống\s+phút|failure\s*mode|node\s+(?:nào|gây)|code\s*review)/i;

/** Chủ ngữ người / đội */
const HUMAN_ACTOR =
  /(?:\b(?:team|đội|on-?call|SRE|Tech Lead|engineer|dev|anh|chị|bạn|chúng ta|họ)\b|đồng nghiệp|stakeholder)/i;

const CONDITION_CUES =
  /(?:\bkhi\b|\bnếu\b|trừ khi|với điều kiện|chỉ khi|không phù hợp|không nên|tuỳ|tùy\s+ngữ cảnh|trong trường hợp)/i;

const TECH_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "các",
  "của",
  "và",
  "cho",
  "một",
  "những",
  "trong",
  "khi",
  "với",
  "được",
  "không",
  "như",
  "hay",
  "hoặc",
  "bài",
  "viết",
  "theo",
  "đến",
  "sau",
  "trước",
  "này",
  "đó",
  "cần",
  "phải",
  "nên",
]);

function openingSample(text: string): string {
  return text
    .replace(/^#[^\n]+\n+/, "")
    .replace(/^\*[^\n]+\*\n+/, "")
    .replace(/^!\[[^\]]*\]\([^)]+\)\n+/, "")
    .replace(/^\s+/, "")
    .slice(0, 500);
}

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

/** Lấy đoạn ví dụ / real-world / recommendations để soi neo Research. */
function extractExampleishSection(text: string): string {
  const blocks: string[] = [];
  const headingRe =
    /^#{1,3}\s+[^\n]*(ví dụ|example|real-?world|case|tình huống|thực tiễn|recommendation|khuyến nghị)[^\n]*$/gim;
  const matches = [...text.matchAll(headingRe)];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index ?? 0;
    const end = matches[i + 1]?.index ?? text.length;
    blocks.push(text.slice(start, end));
  }
  if (blocks.length > 0) return blocks.join("\n\n");
  // Fallback: nửa sau bài (thường chứa case + recommendations)
  const mid = Math.floor(text.length * 0.4);
  return text.slice(mid);
}

function extractRecommendationsSection(text: string): string {
  const m = text.match(
    /^#{1,3}\s+[^\n]*(khuyến nghị|recommendation|practical|áp dụng)[^\n]*\n([\s\S]*?)(?=^#{1,3}\s+|\n*$)/im,
  );
  if (m) return m[0];
  // Clean publish có thể không còn heading biên tập — lấy 1/3 cuối
  return text.slice(Math.floor(text.length * 0.65));
}

/** Token kỹ thuật: từ dài ≥4, có chữ cái, loại stopword. */
export function techTokens(text: string): Set<string> {
  const out = new Set<string>();
  const words = (text ?? "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .match(/[a-zà-ỹ0-9][a-zà-ỹ0-9+./_-]{3,}/gi) ?? [];
  for (const w of words) {
    const t = w.replace(/^[^a-zà-ỹ0-9]+|[^a-zà-ỹ0-9]+$/gi, "").toLowerCase();
    if (t.length < 4) continue;
    if (TECH_STOPWORDS.has(t)) continue;
    if (/^\d+$/.test(t)) continue;
    out.add(t);
  }
  return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function isEngineeringDomain(domain: string | null | undefined): boolean {
  return resolveDomainId(domain) === "engineering";
}

export function inspectEngineeringGoldBar(input: {
  domain: string | null | undefined;
  body: string | null | undefined;
  researchBrief?: string | null;
}): GoldBarResult {
  if (!isEngineeringDomain(input.domain)) {
    return { ok: true, applicable: false, failures: [] };
  }

  const body = (input.body ?? "").trim();
  const failures: GoldBarFailure[] = [];
  if (body.length < 80) {
    return {
      ok: false,
      applicable: true,
      failures: [
        {
          id: "NO_CONCRETE_SCENE",
          message: "Nội dung quá ngắn để đánh giá chuẩn vàng Engineering.",
        },
      ],
    };
  }

  const open = openingSample(body);
  if (
    GENERIC_OPENER_RE.test(body) ||
    STOCK_SCENE_OPENER.test(open) ||
    SLOP_OPENERS.test(open)
  ) {
    failures.push({
      id: "GENERIC_OPENER",
      message:
        "Đoạn mở còn generic / giáo trình / khuôn sprint–fintech — đổi sang nghịch lý hoặc failure cụ thể (xem gold_samples Engineering).",
    });
  }

  const hasOps = OPS_SCENE.test(body);
  const hasActor = HUMAN_ACTOR.test(body);
  if (!hasOps || !hasActor) {
    failures.push({
      id: "NO_CONCRETE_SCENE",
      message:
        "Thiếu mini-case thực tế: cần ≥1 cụm vận hành (pipeline/rollback/on-call/…) VÀ chủ ngữ đội/người.",
    });
  }

  if (!WHEN_NOT.test(body)) {
    failures.push({
      id: "NO_WHEN_NOT",
      message: 'Thiếu mục/đoạn “khi nào KHÔNG nên” / phản biện có điều kiện.',
    });
  } else if (countWhenNotBlocks(body) >= 3) {
    failures.push({
      id: "NO_WHEN_NOT",
      message: "Có ≥3 khối “khi nào không nên” — gộp một lần trong Recommendations.",
    });
  }

  if (HANDBOOK_VOICE.test(body)) {
    failures.push({
      id: "HANDBOOK_VOICE",
      message:
        "Còn giọng handbook/brochure (checklist biện pháp, phụ đề giáo trình) — viết lại như blog kỹ thuật.",
    });
  }

  const research = (input.researchBrief ?? "").trim();
  if (research.length >= 120 && hasOps) {
    const exampleSection = extractExampleishSection(body);
    const sceneTokens = techTokens(exampleSection);
    const researchTokens = techTokens(research);
    const overlap = jaccard(sceneTokens, researchTokens);
    // Case generic: có ops-ish wording nhưng gần như không chồng Research
    if (sceneTokens.size >= 8 && overlap < 0.04) {
      failures.push({
        id: "UNGROUNDED_SCENE",
        message:
          "Mini-case / ví dụ gần như không neo Research Brief (overlap token kỹ thuật quá thấp) — lấy tín hiệu từ nguồn đã research, không bịa case generic.",
      });
    }
  }

  const advice = extractRecommendationsSection(body);
  if (advice.trim().length >= 80 && !CONDITION_CUES.test(advice)) {
    failures.push({
      id: "ADVICE_WITHOUT_CONDITIONS",
      message:
        "Khuyến nghị thiếu điều kiện áp dụng (khi/nếu/trừ khi/chỉ khi…) — tránh lời khuyên tuyệt đối.",
    });
  }

  return {
    ok: failures.length === 0,
    applicable: true,
    failures,
  };
}

export function formatGoldBarError(failures: GoldBarFailure[]): string {
  const head = failures[0];
  const extra =
    failures.length > 1 ? ` (+${failures.length - 1} tiêu chí khác)` : "";
  return `${GOLD_BAR_PREFIX} ${head?.id ?? "FAIL"} — ${head?.message ?? "Chưa đạt chuẩn vàng Engineering."}${extra}`;
}

/** Throw nếu Engineering và chưa đạt bar — prefix GOLD_BAR: để soft-continue nhận diện. */
export function assertEngineeringGoldBar(input: {
  domain: string | null | undefined;
  body: string | null | undefined;
  researchBrief?: string | null;
}): GoldBarResult {
  const result = inspectEngineeringGoldBar(input);
  if (!result.applicable || result.ok) return result;
  throw new Error(formatGoldBarError(result.failures));
}

export function isGoldBarQualityFail(message: string | null | undefined): boolean {
  return Boolean(message && /GOLD_BAR:/i.test(message));
}

export const GOLD_BAR_CHECK_LABELS: Record<GoldBarCheckId, string> = {
  GENERIC_OPENER: "Đoạn mở không generic",
  NO_CONCRETE_SCENE: "Có mini-case vận hành + chủ ngữ người/đội",
  NO_WHEN_NOT: "Có đúng phản biện “khi nào không”",
  HANDBOOK_VOICE: "Không giọng handbook/brochure",
  UNGROUNDED_SCENE: "Case neo Research (không bịa)",
  ADVICE_WITHOUT_CONDITIONS: "Khuyến nghị có điều kiện áp dụng",
};
