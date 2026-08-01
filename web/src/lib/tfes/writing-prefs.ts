/** Cấu hình viết theo bài + mặc định Settings */

import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

/** Flag máy vẫn nhận diện trong chuỗi tự do (quality gate). */
export const AVOID_FORMAT_FLAGS = ["table", "mermaid", "numbered_outline"] as const;
export type AvoidFormatFlag = (typeof AVOID_FORMAT_FLAGS)[number];

export const DEFAULT_TARGET_WORD_COUNT: number = PIPELINE_CONFIG.words.defaultTarget;
export const MIN_TARGET_WORD_COUNT: number = PIPELINE_CONFIG.words.minTarget;
/** Trần cấu hình — trên mức này pipeline dễ cắt token / timeout */
export const MAX_TARGET_WORD_COUNT: number = PIPELINE_CONFIG.words.maxTarget;
export const DEFAULT_AVOID_FORMATS = "table";

export type WritingPrefs = {
  targetWordCount: number;
  /** Chuỗi tự do do biên tập viên nhập (phẩy / câu ngắn). */
  avoidFormatsText: string;
};

/** Chuẩn hoá text tránh format — giữ nội dung tự do, gọn khoảng trắng. */
export function normalizeAvoidFormatsText(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  return raw
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("; ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 500);
}

/**
 * @deprecated Dùng normalizeAvoidFormatsText — giữ để tương thích chỗ còn gọi parse.
 * Trả token đã biết + token tự do (không bỏ mất).
 */
export function parseAvoidFormats(raw: string | null | undefined): string[] {
  const text = normalizeAvoidFormatsText(raw);
  if (!text) return [];
  return text
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Serialize list → text (tương thích API cũ). */
export function serializeAvoidFormats(flags: string[]): string {
  return normalizeAvoidFormatsText(flags.join(", "));
}

export function resolveWritingPrefs(input: {
  targetWordCount?: number | null;
  avoidFormats?: string | null;
  defaultTargetWordCount?: number | null;
  defaultAvoidFormats?: string | null;
}): WritingPrefs {
  const target =
    input.targetWordCount && input.targetWordCount > 0
      ? Math.max(
          MIN_TARGET_WORD_COUNT,
          Math.min(MAX_TARGET_WORD_COUNT, Math.round(input.targetWordCount)),
        )
      : input.defaultTargetWordCount && input.defaultTargetWordCount > 0
        ? Math.max(
            MIN_TARGET_WORD_COUNT,
            Math.min(MAX_TARGET_WORD_COUNT, Math.round(input.defaultTargetWordCount)),
          )
        : DEFAULT_TARGET_WORD_COUNT;

  const avoidRaw =
    input.avoidFormats != null && input.avoidFormats.trim() !== ""
      ? input.avoidFormats
      : (input.defaultAvoidFormats ?? DEFAULT_AVOID_FORMATS);

  return {
    targetWordCount: target,
    avoidFormatsText: normalizeAvoidFormatsText(avoidRaw),
  };
}

/** True nếu prefs nhắc tới flag máy (token hoặc từ khóa gần nghĩa). */
export function hasAvoid(prefs: WritingPrefs, flag: AvoidFormatFlag): boolean {
  const t = prefs.avoidFormatsText.toLowerCase();
  if (!t) return false;
  const tokens = t.split(/[,;]+/).map((s) => s.trim().toLowerCase());
  if (tokens.includes(flag)) return true;

  switch (flag) {
    case "table":
      return /\btable\b|bảng\s*markdown|markdown\s*table/i.test(t);
    case "mermaid":
      return /\bmermaid\b|sơ\s*đồ\s*code|flowchart\s*code/i.test(t);
    case "numbered_outline":
      return (
        /numbered[_\s-]?outline|listicle|outline\s*đánh\s*số|1\.\s*hook/i.test(t) ||
        tokens.some((x) => x.includes("outline") || x.includes("listicle"))
      );
    default:
      return false;
  }
}

/** Block nhúng vào prompt Write / Publish */
export function formatWritingPrefsPrompt(prefs: WritingPrefs): string {
  const avoidLines: string[] = [];
  const text = prefs.avoidFormatsText.trim();

  if (!text) {
    avoidLines.push("- Không ràng buộc format đặc biệt ngoài BAR VIẾT");
  } else {
    avoidLines.push(`- Tránh format (yêu cầu biên tập — bắt buộc): ${text}`);
    if (hasAvoid(prefs, "table")) {
      avoidLines.push("- CẤM markdown table (|---|); dùng đoạn văn hoặc bullet ngắn");
    }
    if (hasAvoid(prefs, "mermaid")) {
      avoidLines.push("- CẤM sơ đồ Mermaid / code fence ```mermaid");
    }
    if (hasAvoid(prefs, "numbered_outline")) {
      avoidLines.push(
        "- CẤM outline listicle đánh số (1. Hook / 2. Khi nào nên / Decision Framework…)",
      );
    }
  }

  const min = Math.round(prefs.targetWordCount * PIPELINE_CONFIG.words.cleanMinRatio);
  const aim = Math.round(prefs.targetWordCount * PIPELINE_CONFIG.words.cleanAimRatio);
  const max = Math.round(prefs.targetWordCount * PIPELINE_CONFIG.words.cleanMaxRatio);

  return `### WRITING PREFS (bắt buộc tuân thủ)
- Độ dài = số TỪ tiếng Việt (tách khoảng trắng), KHÔNG phải số ký tự/chữ cái
- Target bản sạch: ~${prefs.targetWordCount} từ (aim ≥${aim}; máy chấm sàn ≥${Math.max(450, min)}; trần ~${max})
- Viết ĐỦ gần target — mở rộng ví dụ / trade-off / phản biện / mini-case; CẤM dừng sớm hay rút synopsis
${avoidLines.join("\n")}`;
}

/** Heading biên tập — không được xuất hiện trên bản sạch đọc liền */
export const EDITORIAL_HEADING_RE =
  /^#{1,3}\s*(Introduction|Context|Problem Statement|Deep Analysis|Real-world Examples|Practical Recommendations|Executive Summary|Key Takeaways|Metadata)\b/im;

/** Trung thực trí tuệ trên bản đọc liền (không bắt đúng cụm “khi nào KHÔNG nên”) */
export const READER_HONESTY_RE =
  /khi nào\s+(không|KHÔNG)|không nên|tránh khi|chỉ (?:nên |dùng )?khi|không phù hợp|không áp dụng|hạn chế khi|không đưa vào production|điều kiện tiên quyết|khi thiếu/i;

export function hasMarkdownTable(text: string): boolean {
  return /^\s*\|.+\|\s*$/m.test(text) && /^\s*\|?\s*:?-{3,}/m.test(text);
}
