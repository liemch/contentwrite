/** Cấu hình viết theo bài + mặc định Settings */

import { PIPELINE_CONFIG } from "@/lib/tfes/pipeline-config";

export const AVOID_FORMAT_FLAGS = ["table", "mermaid", "numbered_outline"] as const;
export type AvoidFormatFlag = (typeof AVOID_FORMAT_FLAGS)[number];

export const DEFAULT_TARGET_WORD_COUNT: number = PIPELINE_CONFIG.words.defaultTarget;
export const MIN_TARGET_WORD_COUNT: number = PIPELINE_CONFIG.words.minTarget;
/** Trần cấu hình — trên mức này pipeline dễ cắt token / timeout */
export const MAX_TARGET_WORD_COUNT: number = PIPELINE_CONFIG.words.maxTarget;
export const DEFAULT_AVOID_FORMATS = "table";

export type WritingPrefs = {
  targetWordCount: number;
  avoidFormats: AvoidFormatFlag[];
};

export function parseAvoidFormats(raw: string | null | undefined): AvoidFormatFlag[] {
  if (!raw?.trim()) return [];
  const set = new Set<AvoidFormatFlag>();
  for (const part of raw.split(/[,;\s]+/)) {
    const t = part.trim().toLowerCase();
    if ((AVOID_FORMAT_FLAGS as readonly string[]).includes(t)) {
      set.add(t as AvoidFormatFlag);
    }
  }
  return [...set];
}

export function serializeAvoidFormats(flags: AvoidFormatFlag[]): string {
  return flags.join(",");
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
    avoidFormats: parseAvoidFormats(avoidRaw),
  };
}

export function hasAvoid(prefs: WritingPrefs, flag: AvoidFormatFlag): boolean {
  return prefs.avoidFormats.includes(flag);
}

/** Block nhúng vào prompt Write / Publish */
export function formatWritingPrefsPrompt(prefs: WritingPrefs): string {
  const avoidLines: string[] = [];
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
  if (avoidLines.length === 0) {
    avoidLines.push("- Không ràng buộc format đặc biệt ngoài BAR VIẾT");
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

