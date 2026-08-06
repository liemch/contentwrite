import { WorkflowState } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { domainProfilePath } from "@/lib/tfes/domains";
import { getTfesDocument, saveTfesDocument } from "@/lib/tfes/tfes-docs";
import { isAwaitingHumanReview } from "@/lib/tfes/human-review";
import { REVIEW_DONE_MARK } from "@/lib/tfes/parser";

export type MemoryAngle = {
  title: string;
  score: number | null;
  domain: string;
  core: string;
  articleId?: string;
};

export type DeskMetrics = {
  queue: number;
  publishReady: number;
  awaitingHumanReview: number;
  published: number;
  avgScore: number | null;
  scoredCount: number;
  highScoreCount: number;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function overlapScore(a: string, b: string): number {
  const ta = new Set(normalize(a).split(" ").filter((w) => w.length > 2));
  const tb = normalize(b).split(" ").filter((w) => w.length > 2);
  if (!ta.size || !tb.length) return 0;
  let hit = 0;
  for (const w of tb) if (ta.has(w)) hit += 1;
  return hit / Math.max(tb.length, 1);
}

/** Góc đã viết / knowledge — tránh trùng khi tạo bài mới. */
export async function getRelatedAngles(input: {
  domain: string;
  topic?: string | null;
  seriesId?: string | null;
  limit?: number;
  /** Admin: domain-wide published memory. Editor: own workspace + published titles only. */
  accessScope?: { mode: "admin" } | { mode: "owner"; userId: string };
}): Promise<MemoryAngle[]> {
  const limit = input.limit ?? 6;
  const ownerScope =
    input.accessScope?.mode === "owner" ? input.accessScope.userId : null;

  const [records, published, seriesArticles] = await Promise.all([
    prisma.knowledgeRecord.findMany({
      where: { domain: input.domain },
      orderBy: [{ editorialScore: "desc" }, { publishedAt: "desc" }],
      take: 24,
    }),
    prisma.article.findMany({
      where: {
        domain: input.domain,
        workflowState: WorkflowState.PUBLISHED,
        ...(ownerScope ? { createdById: ownerScope } : {}),
      },
      orderBy: { publishedAt: "desc" },
      take: 24,
      select: {
        id: true,
        title: true,
        topic: true,
        knowledgeRecord: true,
        createdById: true,
      },
    }),
    input.seriesId
      ? prisma.article.findMany({
          where: { seriesId: input.seriesId },
          orderBy: [{ seriesOrder: "asc" }, { createdAt: "asc" }],
          take: 12,
          select: {
            id: true,
            title: true,
            topic: true,
            domain: true,
            createdById: true,
            workflowState: true,
          },
        })
      : Promise.resolve([]),
  ]);

  let filteredRecords = records;
  if (ownerScope) {
    const ownedArticleIds = new Set(
      (
        await prisma.article.findMany({
          where: { createdById: ownerScope },
          select: { id: true },
        })
      ).map((a) => a.id),
    );
    filteredRecords = records.filter((r) => ownedArticleIds.has(r.articleId));
  }

  const topic = (input.topic ?? "").trim();
  const angles: MemoryAngle[] = filteredRecords.map((r) => ({
    title: r.title,
    score: r.editorialScore,
    domain: r.domain,
    core: (r.coreMessage ?? "").replace(/\s+/g, " ").slice(0, 140),
    articleId: r.articleId,
  }));

  for (const a of published) {
    const title = (a.title || a.topic || "").trim();
    if (!title) continue;
    if (angles.some((x) => normalize(x.title) === normalize(title))) continue;
    angles.push({
      title,
      score: null,
      domain: input.domain,
      core: "",
      articleId: a.id,
    });
  }

  for (const s of seriesArticles) {
    if (ownerScope && s.createdById !== ownerScope && s.workflowState !== WorkflowState.PUBLISHED) {
      continue;
    }
    const title = (s.title || s.topic || "").trim();
    if (!title) continue;
    if (angles.some((x) => normalize(x.title) === normalize(title))) continue;
    angles.unshift({
      title: `[Series] ${title}`,
      score: null,
      domain: s.domain,
      core: "cùng series — tránh trùng góc",
      articleId: s.id,
    });
  }

  if (!topic) {
    return angles.slice(0, limit);
  }

  return angles
    .map((a) => ({
      a,
      s: Math.max(overlapScore(topic, a.title), overlapScore(topic, a.core)),
    }))
    .sort((x, y) => y.s - x.s || (y.a.score ?? 0) - (x.a.score ?? 0))
    .filter((x) => x.s > 0.08 || !topic || x.a.title.startsWith("[Series]"))
    .slice(0, limit)
    .map((x) => x.a);
}

export async function getDeskMetrics(whereArticles: {
  createdById?: string;
}): Promise<DeskMetrics> {
  const articleWhere =
    whereArticles.createdById != null
      ? { createdById: whereArticles.createdById }
      : {};

  const articles = await prisma.article.findMany({
    where: articleWhere,
    select: {
      id: true,
      status: true,
      workflowState: true,
      knowledgeRecord: true,
      factCheck: true,
    },
  });

  const scoreRows = await prisma.knowledgeRecord.findMany({
    where:
      whereArticles.createdById != null
        ? { articleId: { in: articles.map((a) => a.id) } }
        : {},
    select: { editorialScore: true },
    take: 200,
    orderBy: { publishedAt: "desc" },
  });

  const stoppedStates = new Set<WorkflowState>([
    WorkflowState.PUBLISH_READY,
    WorkflowState.APPROVED,
    WorkflowState.PUBLISHED,
    WorkflowState.CORRECTION_REQUIRED,
    WorkflowState.RETRACTED,
  ]);
  const queue = articles.filter((a) => !stoppedStates.has(a.workflowState)).length;
  const publishReady = articles.filter((a) => a.workflowState === WorkflowState.PUBLISH_READY).length;
  const published = articles.filter((a) => a.workflowState === WorkflowState.PUBLISHED).length;
  const awaitingHumanReview = articles.filter((a) =>
    isAwaitingHumanReview({
      knowledgeRecord: a.knowledgeRecord,
      factCheck: a.factCheck,
    }),
  ).length;

  const scored = scoreRows
    .map((r) => r.editorialScore)
    .filter((n): n is number => typeof n === "number" && n >= 1);
  const avgScore =
    scored.length > 0
      ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10
      : null;

  return {
    queue,
    publishReady,
    awaitingHumanReview,
    published,
    avgScore,
    scoredCount: scored.length,
    highScoreCount: scored.filter((n) => n >= 4).length,
  };
}

/** Format memory block cho LLM research (richer). */
export async function buildEditorialMemoryBlock(
  domain: string,
  opts?: {
    seriesId?: string | null;
    accessScope?: { mode: "admin" } | { mode: "owner"; userId: string };
  },
): Promise<string> {
  const angles = await getRelatedAngles({
    domain,
    limit: 10,
    seriesId: opts?.seriesId,
    accessScope: opts?.accessScope,
  });
  const seriesLines: string[] = [];

  if (opts?.seriesId) {
    const siblings = await prisma.article.findMany({
      where: { seriesId: opts.seriesId },
      orderBy: [{ seriesOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        title: true,
        topic: true,
        seriesOrder: true,
        status: true,
        knowledgeRecord: true,
        createdById: true,
        workflowState: true,
      },
      take: 20,
    });
    const ownerScope =
      opts.accessScope?.mode === "owner" ? opts.accessScope.userId : null;
    for (const s of siblings) {
      if (
        ownerScope &&
        s.createdById !== ownerScope &&
        s.workflowState !== WorkflowState.PUBLISHED
      ) {
        continue;
      }
      const title = (s.title || s.topic || "Untitled").trim();
      const order = s.seriesOrder != null ? `#${s.seriesOrder}` : "·";
      seriesLines.push(`- ${order} ${title} [${s.status}]`);
    }
  }

  if (angles.length === 0 && seriesLines.length === 0) {
    return "kho đang trống — chạy Seeding Mode";
  }

  const lines = angles.map((a) => {
    const score = a.score != null ? `score ${a.score}/5` : "published";
    const core = a.core ? ` | ${a.core}` : "";
    return `- ${a.title} (${score})${core}`;
  });

  const seriesBlock =
    seriesLines.length > 0
      ? `\n## Series siblings (CẤM trùng góc / mở bài giống trong series)
${seriesLines.join("\n")}
`
      : "";

  return `## Editorial Memory (đã có — CẤM trùng góc / mở bài giống)
${lines.join("\n")}
${seriesBlock}
Khi chọn góc mới: khác luận điểm cốt lõi; xoay shape/mở bài; không viết lại cùng insight với wording khác.${
    seriesLines.length
      ? " Trong series: mỗi bài một góc hẹp khác; nối mạch nhưng không lặp luận điểm."
      : ""
  }`;
}

/**
 * Bài điểm ≥4 → append mini gold_sample vào Domain Profile (TfesDocument override).
 */
export async function appendGoldSampleFromArticle(input: {
  domain: string;
  title: string;
  cleanPublish: string;
  score: number;
  updatedBy?: string | null;
}): Promise<{ appended: boolean; reason?: string }> {
  if (input.score < 4) {
    return { appended: false, reason: "score < 4" };
  }

  const path = domainProfilePath(input.domain);
  const doc = await getTfesDocument(path);
  let content = doc.content || "";

  const opener =
    input.cleanPublish
      .replace(/^#[^\n]+\n+/, "")
      .replace(/^\*[^\n]+\*\n+/, "")
      .replace(/^!\[[^\]]*\]\([^)]+\)\n+/, "")
      .split(/\n\n+/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .find((p) => p.length > 40 && !p.startsWith("#")) || "";

  if (opener.length < 40) {
    return { appended: false, reason: "không tách được đoạn mở" };
  }

  const sampleTitle = input.title.slice(0, 80);
  if (content.includes(sampleTitle) && content.includes(opener.slice(0, 60))) {
    return { appended: false, reason: "đã có sample tương tự" };
  }

  const block = `
### Sample (auto · ${sampleTitle} · ${input.score}/5)
Mở: “${opener.slice(0, 220).replace(/"/g, "'")}”
Nhịp: (từ bài điểm cao — bắt chước độ cụ thể, không copy nguyên văn)
Tránh: khuôn sprint/fintech; giáo trình.
`.trim();

  if (!/##\s*gold_samples/i.test(content)) {
    content = `${content.trim()}\n\n## gold_samples\nChuẩn “hay” — bắt chước nhịp / độ cụ thể / mở bài, không copy nguyên văn.\n\n${block}\n`;
  } else {
    // Append before end of file / next ## after gold_samples if possible
    const m = content.match(/##\s*gold_samples\b[\s\S]*?(?=\n##\s+[a-z_]|\n*$)/i);
    if (m && m.index != null) {
      const start = m.index;
      const section = m[0].trimEnd();
      const rest = content.slice(start + m[0].length);
      content = `${content.slice(0, start)}${section}\n\n${block}\n${rest}`;
    } else {
      content = `${content.trim()}\n\n${block}\n`;
    }
  }

  // Giữ file không phình vô hạn — cắt nếu > 8 samples auto
  const autoSamples = content.match(/### Sample \(auto ·/g) ?? [];
  if (autoSamples.length > 8) {
    // drop oldest auto sample block
    content = content.replace(
      /### Sample \(auto ·[\s\S]*?(?=### Sample \(auto ·|##\s+[a-z_]|$)/i,
      "",
    );
  }

  await saveTfesDocument({
    path,
    content,
    updatedBy: input.updatedBy ?? "system-gold",
  });

  return { appended: true };
}

/** Count awaiting human for dashboard without full article fetch helper */
export function countAwaitingFromRows(
  rows: Array<{ knowledgeRecord?: string | null; factCheck?: string | null }>,
): number {
  return rows.filter((r) => {
    const kr = r.knowledgeRecord ?? "";
    if (!kr.includes(REVIEW_DONE_MARK)) return false;
    return isAwaitingHumanReview(r);
  }).length;
}
