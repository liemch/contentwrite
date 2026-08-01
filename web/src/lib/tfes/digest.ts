import { ArticleStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { chatCompletion } from "@/lib/nvidia";
import { clipText } from "@/lib/tfes/parser";

export type DigestSource = {
  articleId: string;
  title: string;
  score: number | null;
  domain: string;
  core: string;
};

/** ISO week label: 2026-W31 */
export function currentWeekLabel(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function pickDigestSources(input?: {
  domain?: string | null;
  minScore?: number;
  limit?: number;
  sinceDays?: number;
}): Promise<DigestSource[]> {
  const minScore = input?.minScore ?? 4;
  const limit = input?.limit ?? 5;
  const sinceDays = input?.sinceDays ?? 21;
  const since = new Date(Date.now() - sinceDays * 86400000);

  const records = await prisma.knowledgeRecord.findMany({
    where: {
      editorialScore: { gte: minScore },
      ...(input?.domain ? { domain: input.domain } : {}),
      publishedAt: { gte: since },
    },
    orderBy: [{ editorialScore: "desc" }, { publishedAt: "desc" }],
    take: limit * 2,
  });

  const publishedIds = new Set(
    (
      await prisma.article.findMany({
        where: {
          id: { in: records.map((r) => r.articleId) },
          status: ArticleStatus.PUBLISHED,
        },
        select: { id: true },
      })
    ).map((a) => a.id),
  );

  return records
    .filter((r) => publishedIds.has(r.articleId))
    .slice(0, limit)
    .map((r) => ({
      articleId: r.articleId,
      title: r.title,
      score: r.editorialScore,
      domain: r.domain,
      core: (r.coreMessage ?? "").replace(/\s+/g, " ").slice(0, 220),
    }));
}

export async function generateWeeklyDigest(input: {
  createdById?: string | null;
  domain?: string | null;
  weekLabel?: string;
}): Promise<{
  digest: Awaited<ReturnType<typeof prisma.digest.create>>;
  sources: DigestSource[];
}> {
  const weekLabel = input.weekLabel || currentWeekLabel();
  const sources = await pickDigestSources({
    domain: input.domain,
    minScore: 4,
    limit: 5,
  });

  if (sources.length === 0) {
    throw new Error(
      "Chưa đủ bài publish điểm ≥4 trong ~3 tuần gần đây để tạo digest.",
    );
  }

  const sourceBlock = sources
    .map(
      (s, i) =>
        `${i + 1}. [${s.score}/5] ${s.title} (${s.domain})\n   ${s.core || "(không có core message)"}`,
    )
    .join("\n");

  const articles = await prisma.article.findMany({
    where: { id: { in: sources.map((s) => s.articleId) } },
    select: { id: true, cleanPublish: true, title: true },
  });
  const excerpts = articles
    .map((a) => {
      const body = (a.cleanPublish ?? "")
        .replace(/^#[^\n]+\n+/, "")
        .split(/\n\n+/)
        .slice(0, 2)
        .join(" ")
        .replace(/\s+/g, " ")
        .slice(0, 400);
      return `### ${a.title || "Untitled"}\n${body}`;
    })
    .join("\n\n");

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content:
          "Bạn là biên tập viên nội bộ. Viết digest tuần ngắn gọn tiếng Việt, markdown.",
      },
      {
        role: "user",
        content: `Tạo WEEKLY DIGEST nội bộ cho ${weekLabel}.

Nguồn (đã publish, điểm cao):
${sourceBlock}

Đoạn trích:
${clipText(excerpts, 3500)}

Yêu cầu:
- Title dòng 1: # Digest ${weekLabel}: …
- Mở 2–3 câu: vì sao tuần này đáng nhớ
- 4–5 mục: mỗi mục 1 insight + 1 câu “đưa vào việc gì tuần sau”
- Kết: 1 câu hỏi mở cho team
- Không bán hàng; không listicle rỗng; không lặp nguyên văn bài gốc
- ~450–700 từ`,
      },
    ],
    { maxTokens: 1800, temperature: 0.4 },
  );

  const body = raw.trim();
  if (body.length < 120) {
    throw new Error("LLM trả digest quá ngắn — thử lại.");
  }

  const titleMatch = body.match(/^#\s+(.+)$/m);
  const title =
    titleMatch?.[1]?.trim() ||
    `Digest ${weekLabel} — ${sources.length} insight điểm cao`;

  const digest = await prisma.digest.create({
    data: {
      title,
      weekLabel,
      domain: input.domain || null,
      body,
      sourceJson: JSON.stringify(sources),
      status: "DRAFT",
      createdById: input.createdById || null,
    },
  });

  return { digest, sources };
}
