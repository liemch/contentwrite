/**
 * Chọn khung bài: auto / manual / locked-by-format + gợi ý theo domain.
 */

import {
  ARTICLE_SHAPES,
  BLOG_ROTATING_SHAPE_IDS,
  getArticleShapeById,
  isArticleShapeId,
  type ArticleShape,
  type ArticleShapeId,
} from "@/lib/tfes/article-shapes";
import {
  resolvePublishFormat,
  type PublishFormatId,
} from "@/lib/tfes/publish-formats";
import { resolveDomainId, type DomainId } from "@/lib/tfes/domains";

export type ShapeSelectionMode = "auto" | "manual" | "locked";

export type ShapeChoice = ArticleShape & {
  /** Gợi ý mạnh cho domain hiện tại */
  recommended: boolean;
  reason: string;
};

export type ShapeSelectionMeta = {
  mode: ShapeSelectionMode;
  labelVi: string;
  badge: string;
  hint: string;
  shape: ArticleShape | null;
  lockedByFormat: boolean;
  choices: ShapeChoice[];
  recommendedChoices: ShapeChoice[];
};

/**
 * Khung blog được gợi ý theo domain — tránh chọn khung lệch tông.
 * Format-locked (facebook/adr/…) không nằm ở đây.
 */
export const DOMAIN_RECOMMENDED_SHAPES: Record<DomainId, ArticleShapeId[]> = {
  engineering: [
    "paradox-deepdive",
    "failure-postmortem",
    "constraint-first",
    "debate-two-sides",
    "timeline-reframe",
    "before-after",
    "cost-of-inaction",
    "field-note",
    "narrative-case",
  ],
  "soft-skills": [
    "narrative-case",
    "question-led",
    "before-after",
    "myth-bust",
    "playbook-conditional",
    "cost-of-inaction",
    "debate-two-sides",
  ],
  product: [
    "cost-of-inaction",
    "before-after",
    "debate-two-sides",
    "constraint-first",
    "paradox-deepdive",
    "playbook-conditional",
    "question-led",
    "narrative-case",
  ],
  "ai-ml": [
    "paradox-deepdive",
    "failure-postmortem",
    "myth-bust",
    "constraint-first",
    "before-after",
    "timeline-reframe",
    "field-note",
    "debate-two-sides",
  ],
  security: [
    "failure-postmortem",
    "constraint-first",
    "timeline-reframe",
    "cost-of-inaction",
    "paradox-deepdive",
    "field-note",
    "debate-two-sides",
  ],
  fun: [
    "myth-bust",
    "before-after",
    "question-led",
    "narrative-case",
    "timeline-reframe",
    "playbook-conditional",
  ],
  "new-tech": [
    "myth-bust",
    "before-after",
    "paradox-deepdive",
    "cost-of-inaction",
    "constraint-first",
    "debate-two-sides",
    "field-note",
    "timeline-reframe",
  ],
  lifestyle: [
    "before-after",
    "myth-bust",
    "playbook-conditional",
    "narrative-case",
    "question-led",
    "cost-of-inaction",
  ],
};

const DOMAIN_SHAPE_REASON: Partial<Record<ArticleShapeId, string>> = {
  "paradox-deepdive": "Trade-off / điều kiện ẩn — hợp bài kỹ thuật sâu",
  "failure-postmortem": "Sự cố / failure mode có bài học hẹp",
  "debate-two-sides": "Hai hướng thiết kế cần chốt có điều kiện",
  "narrative-case": "Case dài, dễ đồng cảm",
  "question-led": "Phá câu hỏi sai / dẫn dắt bằng hỏi",
  "field-note": "Quyết định hẹp, thực dụng tuần này",
  "before-after": "Có trạng thái trước/sau rõ",
  "myth-bust": "Niềm tin phổ biến cần lật",
  "constraint-first": "Quyết định bị siết SLO/budget/risk",
  "timeline-reframe": "Chuỗi sự kiện → insight khác",
  "playbook-conditional": "Hướng dẫn có điều kiện dùng/không",
  "cost-of-inaction": "Quyết định đang bị trì / chi phí im lặng",
};

export function recommendedShapeIdsForDomain(
  domain?: string | null,
): ArticleShapeId[] {
  const id = resolveDomainId(domain);
  return DOMAIN_RECOMMENDED_SHAPES[id] ?? DOMAIN_RECOMMENDED_SHAPES.engineering;
}

export function isShapeRecommendedForDomain(
  shapeId: string,
  domain?: string | null,
): boolean {
  return recommendedShapeIdsForDomain(domain).includes(shapeId as ArticleShapeId);
}

/** CSV domains mặc định cho Shape Profile (auto-rotate). */
export function defaultDomainsCsvForShape(shapeId: ArticleShapeId): string {
  const domains = (Object.keys(DOMAIN_RECOMMENDED_SHAPES) as DomainId[]).filter(
    (domain) => DOMAIN_RECOMMENDED_SHAPES[domain].includes(shapeId),
  );
  if (domains.length === 0) return "*";
  if (domains.length >= 6) return "*";
  return domains.join(",");
}

/** Khung tương thích format, gắn cờ recommended theo domain. */
export function shapesCompatibleWithFormat(
  publishFormat?: string | null,
  domain?: string | null,
): ShapeChoice[] {
  const format = resolvePublishFormat(publishFormat);
  const recommendedIds = new Set(recommendedShapeIdsForDomain(domain));

  const toChoice = (shape: ArticleShape): ShapeChoice => {
    const recommended =
      Boolean(format.lockShape) || recommendedIds.has(shape.id);
    return {
      ...shape,
      recommended,
      reason: recommended
        ? DOMAIN_SHAPE_REASON[shape.id] ??
          (format.lockShape
            ? "Khóa theo định dạng xuất bản"
            : "Phù hợp domain đang chọn")
        : "Ít hợp domain này — dễ ra bài lệch tông",
    };
  };

  if (format.lockShape && ARTICLE_SHAPES[format.lockShape]) {
    return [toChoice(ARTICLE_SHAPES[format.lockShape])];
  }

  const rotating = BLOG_ROTATING_SHAPE_IDS.map((id) => toChoice(ARTICLE_SHAPES[id]));
  const recommendedOrder = recommendedShapeIdsForDomain(domain);
  const recommended = recommendedOrder
    .map((id) => rotating.find((item) => item.id === id))
    .filter((item): item is ShapeChoice => Boolean(item));
  const rest = rotating.filter((item) => !recommendedIds.has(item.id));
  return [...recommended, ...rest];
}

export function resolveShapeSelection(input: {
  publishFormat?: string | null;
  domain?: string | null;
  articleShapeId?: string | null;
  requestedMode?: string | null;
}): ShapeSelectionMeta {
  const format = resolvePublishFormat(input.publishFormat);
  const choices = shapesCompatibleWithFormat(format.id, input.domain);
  const recommendedChoices = choices.filter((item) => item.recommended);
  const lockedByFormat = Boolean(format.lockShape);
  const domainId = resolveDomainId(input.domain);

  if (lockedByFormat && format.lockShape) {
    const shape = ARTICLE_SHAPES[format.lockShape];
    const lockedChoice: ShapeChoice = {
      ...shape,
      recommended: true,
      reason: "Khóa theo định dạng xuất bản",
    };
    return {
      mode: "locked",
      labelVi: "Khóa theo định dạng",
      badge: "khóa format",
      hint: `Format ${format.labelVi} bắt buộc khung ${shape.labelVi} — không xoay tự động.`,
      shape,
      lockedByFormat: true,
      choices: [lockedChoice],
      recommendedChoices: [lockedChoice],
    };
  }

  const modeRaw = (input.requestedMode ?? "").trim().toLowerCase();
  const hasManualId =
    isArticleShapeId(input.articleShapeId) &&
    choices.some((item) => item.id === input.articleShapeId);

  if (modeRaw === "manual" || (hasManualId && modeRaw !== "auto")) {
    const shape = hasManualId
      ? getArticleShapeById(input.articleShapeId as ArticleShapeId)
      : null;
    const fit = shape ? isShapeRecommendedForDomain(shape.id, domainId) : true;
    return {
      mode: "manual",
      labelVi: "Chọn tay",
      badge: fit ? "chọn tay" : "chọn tay · lệch domain",
      hint: shape
        ? fit
          ? `Biên tập viên chọn ${shape.labelVi} (gợi ý cho ${domainId}).`
          : `⚠️ ${shape.labelVi} ít hợp domain ${domainId} — cân nhắc khung được gợi ý phía trên.`
        : "Biên tập viên sẽ chọn khung thủ công.",
      shape,
      lockedByFormat: false,
      choices,
      recommendedChoices,
    };
  }

  const shape = isArticleShapeId(input.articleShapeId)
    ? getArticleShapeById(input.articleShapeId)
    : null;
  return {
    mode: "auto",
    labelVi: "Tự chọn",
    badge: "tự chọn",
    hint: shape
      ? `Hệ thống đã chọn ${shape.labelVi} (xoay theo domain ${domainId} + cooldown).`
      : `Hệ thống sẽ tự chọn trong ${recommendedChoices.length} khung gợi ý cho domain ${domainId}.`,
    shape,
    lockedByFormat: false,
    choices,
    recommendedChoices,
  };
}

export function buildShapeAssignment(shapeId: ArticleShapeId): {
  articleShapeId: string;
  articleShapeVersion: string;
  articleShapeSnapshot: string;
  openingPattern: string;
  narrativePattern: string;
} {
  const shape = getArticleShapeById(shapeId);
  return {
    articleShapeId: shape.id,
    articleShapeVersion: "1.0",
    articleShapeSnapshot: JSON.stringify(shape),
    openingPattern: shape.opening,
    narrativePattern: shape.beats.join(" → "),
  };
}

export function coerceManualShapeForFormat(input: {
  publishFormat?: string | null;
  domain?: string | null;
  articleShapeId?: string | null;
  /** true = chặn khung không nằm trong gợi ý domain (blog) */
  strictDomainFit?: boolean;
}): {
  mode: ShapeSelectionMode;
  assignment: ReturnType<typeof buildShapeAssignment> | null;
  warning?: string;
} {
  const format = resolvePublishFormat(input.publishFormat);
  const domainId = resolveDomainId(input.domain);
  if (format.lockShape) {
    return {
      mode: "locked",
      assignment: buildShapeAssignment(format.lockShape),
    };
  }
  const raw = (input.articleShapeId ?? "").trim();
  if (!raw || raw === "auto") {
    return { mode: "auto", assignment: null };
  }
  if (!isArticleShapeId(raw)) {
    throw new Error(`Khung không hợp lệ: ${raw}`);
  }
  const allowed = shapesCompatibleWithFormat(format.id, domainId).map((item) => item.id);
  if (!allowed.includes(raw)) {
    throw new Error(
      `Khung ${raw} không tương thích format ${format.id}. Chọn trong: ${allowed.join(", ")}`,
    );
  }
  const recommended = isShapeRecommendedForDomain(raw, domainId);
  if (!recommended && input.strictDomainFit) {
    throw new Error(
      `Khung ${raw} ít hợp domain ${domainId}. Chọn gợi ý: ${recommendedShapeIdsForDomain(domainId).join(", ")}`,
    );
  }
  return {
    mode: "manual",
    assignment: buildShapeAssignment(raw),
    warning: recommended
      ? undefined
      : `Khung ${raw} ít hợp domain ${domainId} — bài dễ lệch tông.`,
  };
}

export function formatIdsForPublishFormat(
  publishFormat: PublishFormatId | string,
  domain?: string | null,
): ArticleShapeId[] {
  return shapesCompatibleWithFormat(publishFormat, domain).map((item) => item.id);
}
