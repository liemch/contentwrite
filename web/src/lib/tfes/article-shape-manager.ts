import type { ArticleShapeProfile } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ARTICLE_SHAPES, type ArticleShape, type ArticleShapeId } from "@/lib/tfes/article-shapes";
import { resolvePublishFormat } from "@/lib/tfes/publish-formats";

export type ShapeProfileView = {
  id: string;
  version: string;
  labelVi: string;
  fit: string;
  definition: ArticleShape;
  active: boolean;
  weight: number;
  cooldownArticles: number;
  compatibleFormats: string;
  domains: string;
  insightKinds: string;
};

function defaultProfile(shape: ArticleShape): ShapeProfileView {
  const lockedFormat = shape.id === "failure-postmortem"
    ? "blog,postmortem"
    : ["field-note", "adr", "internal-brief", "thread-qa"].includes(shape.id)
      ? shape.id
      : "blog";
  const kindMap: Partial<Record<ArticleShapeId, string>> = {
    "paradox-deepdive": "paradox,trade-off",
    "failure-postmortem": "failure,incident",
    "debate-two-sides": "comparison,debate,trade-off",
    "narrative-case": "case,narrative",
    "question-led": "question,reframe",
    "field-note": "practice,decision",
    adr: "decision,architecture",
    "internal-brief": "decision,proposal",
    "thread-qa": "question,reframe",
  };
  return {
    id: shape.id,
    version: "1.0",
    labelVi: shape.labelVi,
    fit: shape.fit,
    definition: shape,
    active: true,
    weight: 10,
    cooldownArticles: 4,
    compatibleFormats: lockedFormat,
    domains: "*",
    insightKinds: kindMap[shape.id] ?? "*",
  };
}

function fromRow(row: ArticleShapeProfile): ShapeProfileView {
  const fallback = ARTICLE_SHAPES[row.id as ArticleShapeId] ?? ARTICLE_SHAPES["paradox-deepdive"];
  const parsed = row.definitionJson as unknown;
  const definition = parsed && typeof parsed === "object"
    ? ({ ...fallback, ...(parsed as Partial<ArticleShape>), id: row.id as ArticleShapeId } as ArticleShape)
    : fallback;
  return {
    id: row.id,
    version: row.version,
    labelVi: row.labelVi,
    fit: row.fit,
    definition,
    active: row.active,
    weight: row.weight,
    cooldownArticles: row.cooldownArticles,
    compatibleFormats: row.compatibleFormats,
    domains: row.domains,
    insightKinds: row.insightKinds,
  };
}

export async function ensureDefaultShapeProfiles(): Promise<void> {
  const count = await prisma.articleShapeProfile.count();
  if (count > 0) return;
  await prisma.articleShapeProfile.createMany({
    data: Object.values(ARTICLE_SHAPES).map((shape) => {
      const profile = defaultProfile(shape);
      return {
        id: profile.id,
        version: profile.version,
        labelVi: profile.labelVi,
        fit: profile.fit,
        definitionJson: profile.definition,
        active: profile.active,
        weight: profile.weight,
        cooldownArticles: profile.cooldownArticles,
        compatibleFormats: profile.compatibleFormats,
        domains: profile.domains,
        insightKinds: profile.insightKinds,
      };
    }),
    skipDuplicates: true,
  });
}

export async function listShapeProfiles(): Promise<ShapeProfileView[]> {
  try {
    await ensureDefaultShapeProfiles();
    return (await prisma.articleShapeProfile.findMany({ orderBy: { id: "asc" } })).map(fromRow);
  } catch {
    return Object.values(ARTICLE_SHAPES).map(defaultProfile);
  }
}

function csvMatches(csv: string, value: string): boolean {
  const values = csv.split(",").map((item) => item.trim()).filter(Boolean);
  return values.includes("*") || values.includes(value);
}

function insightKinds(text: string): Set<string> {
  const kinds = new Set<string>();
  if (/nghịch lý|paradox|nhưng chỉ khi|điều kiện ẩn/i.test(text)) kinds.add("paradox");
  if (/trade-?off|đánh đổi|hai phe|so sánh|versus|\bvs\b/i.test(text)) kinds.add("trade-off");
  if (/sự cố|incident|failure|thất bại|root cause/i.test(text)) kinds.add("failure");
  if (/case|tình huống|câu chuyện/i.test(text)) kinds.add("case");
  if (/câu hỏi|hỏi sai|reframe|đảo trực giác/i.test(text)) kinds.add("question");
  if (/quyết định|decision|architecture|kiến trúc/i.test(text)) kinds.add("decision");
  if (kinds.size === 0) kinds.add("practice");
  return kinds;
}

function deterministicNoise(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (Math.abs(hash) % 1000) / 1000;
}

export async function selectArticleShape(input: {
  articleId: string;
  domain: string;
  publishFormat?: string | null;
  topic?: string | null;
  insightGate?: string | null;
}): Promise<{
  id: string;
  version: string;
  snapshot: string;
  openingPattern: string;
  narrativePattern: string;
}> {
  const profiles = (await listShapeProfiles()).filter((profile) => profile.active);
  const format = resolvePublishFormat(input.publishFormat);
  const locked = format.lockShape
    ? profiles.find((profile) => profile.id === format.lockShape)
    : null;
  const candidates = locked
    ? [locked]
    : profiles.filter(
        (profile) =>
          csvMatches(profile.compatibleFormats, format.id) && csvMatches(profile.domains, input.domain),
      );
  const pool = candidates.length > 0 ? candidates : Object.values(ARTICLE_SHAPES).map(defaultProfile);
  const recent = await prisma.article.findMany({
    where: { domain: input.domain, articleShapeId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { articleShapeId: true, openingPattern: true, narrativePattern: true },
  }).catch(() => []);
  const kinds = insightKinds(`${input.topic ?? ""}\n${input.insightGate ?? ""}`);
  const ranked = pool.map((profile) => {
    const acceptedKinds = profile.insightKinds.split(",").map((kind) => kind.trim());
    const kindFit = acceptedKinds.includes("*") || acceptedKinds.some((kind) => kinds.has(kind));
    const cooldownWindow = recent.slice(0, Math.max(0, profile.cooldownArticles));
    const inCooldown = cooldownWindow.some((article) => article.articleShapeId === profile.id);
    const usage = recent.filter((article) => article.articleShapeId === profile.id).length;
    const openingReuse = recent.slice(0, 8).filter((article) => article.openingPattern === profile.definition.opening).length;
    return {
      profile,
      score:
        profile.weight +
        (kindFit ? 30 : 0) -
        (inCooldown ? 100 : 0) -
        usage * 5 -
        openingReuse * 8 +
        deterministicNoise(`${input.articleId}:${profile.id}`),
    };
  });
  ranked.sort((a, b) => b.score - a.score);
  const chosen = ranked[0]!.profile;
  return {
    id: chosen.id,
    version: chosen.version,
    snapshot: JSON.stringify(chosen.definition),
    openingPattern: chosen.definition.opening,
    narrativePattern: chosen.definition.beats.join(" → "),
  };
}

export async function updateShapeProfile(
  input: ShapeProfileView,
  updatedBy: string,
): Promise<ShapeProfileView> {
  if (!input.id.trim()) throw new Error("Shape id không được trống");
  if (!input.definition.beats?.length) throw new Error("Shape cần ít nhất một story beat");
  if (input.weight < 0 || input.weight > 100) throw new Error("Weight phải từ 0–100");
  if (input.cooldownArticles < 0 || input.cooldownArticles > 50) {
    throw new Error("Cooldown phải từ 0–50 bài");
  }
  const row = await prisma.articleShapeProfile.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      version: input.version,
      labelVi: input.labelVi,
      fit: input.fit,
      definitionJson: input.definition,
      active: input.active,
      weight: input.weight,
      cooldownArticles: input.cooldownArticles,
      compatibleFormats: input.compatibleFormats,
      domains: input.domains,
      insightKinds: input.insightKinds,
      updatedBy,
    },
    update: {
      version: input.version,
      labelVi: input.labelVi,
      fit: input.fit,
      definitionJson: input.definition,
      active: input.active,
      weight: input.weight,
      cooldownArticles: input.cooldownArticles,
      compatibleFormats: input.compatibleFormats,
      domains: input.domains,
      insightKinds: input.insightKinds,
      updatedBy,
    },
  });
  return fromRow(row);
}
