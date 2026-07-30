import { chatCompletion } from "@/lib/nvidia";
import { formatSearchResults, webSearch } from "@/lib/search";
import { getSystemPromptLite } from "@/lib/tfes/prompts";
import { parseCustomTopics } from "@/lib/auto-write/schedule";

export type SeedDomain = "engineering" | "soft-skills";

const TREND_QUERIES: Record<SeedDomain, string[]> = {
  engineering: [
    "software engineering architecture trends last 3 months 2026",
    "developer tools platform DevOps AI coding agents trends 2026",
    "cloud reliability observability API security trade-offs 2026",
  ],
  "soft-skills": [
    "engineering leadership soft skills workplace trends last 3 months 2026",
    "remote team feedback decision making career growth trends 2026",
    "manager communication conflict collaboration trends tech teams 2026",
  ],
};

function parseSeedLines(raw: string): string[] {
  return raw
    .split(/\n/)
    .map((line) =>
      line
        .replace(/^[-*•]\s*/, "")
        .replace(/^\d+[.)]\s*/, "")
        .replace(/^["']|["']$/g, "")
        .trim(),
    )
    .filter((s) => s.length >= 8 && s.length <= 120)
    .filter((s) => !/^(đây|here|topic|seed|danh sách)/i.test(s));
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}

/** Tavily (3 tháng) → NVIDIA format 20–30 seed topics */
export async function suggestTrendSeedTopics(input: {
  domain: SeedDomain;
  existingSeeds?: string;
}): Promise<{ topics: string[]; searchHits: number; llmMs: number }> {
  const queries = TREND_QUERIES[input.domain];
  const batches = await Promise.all(
    queries.map((q) =>
      webSearch(q, { depth: "basic", maxResults: 6, days: 90 }).catch(() => []),
    ),
  );
  const merged = batches.flat();
  const uniqueByUrl = new Map<string, (typeof merged)[number]>();
  for (const r of merged) {
    const key = r.url || r.title;
    if (!uniqueByUrl.has(key)) uniqueByUrl.set(key, r);
  }
  const results = [...uniqueByUrl.values()].slice(0, 18);
  if (results.length < 3) {
    throw new Error(
      "Tavily không đủ nguồn trend (3 tháng). Kiểm tra TAVILY_API_KEY hoặc thử lại.",
    );
  }

  const existing = parseCustomTopics(input.existingSeeds).slice(0, 40);
  const avoidBlock =
    existing.length > 0
      ? `\n### Seed đang có (TRÁNH trùng gần đúng)\n${existing.map((t) => `- ${t}`).join("\n")}\n`
      : "";

  const domainLabel =
    input.domain === "soft-skills"
      ? "soft-skills (leadership, feedback, collaboration, career)"
      : "engineering (architecture, platform, reliability, AI tooling, API)";

  const llmStarted = Date.now();
  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: getSystemPromptLite(input.domain),
      },
      {
        role: "user",
        content: `## Nhiệm vụ: gợi ý SEED TOPICS đang trend (~3 tháng gần đây)

Domain: **${domainLabel}**

Từ WEB SEARCH RESULTS (nguồn thật), rút **20–30** chủ đề bài viết editorial (AI-TFES) — góc học tập/thực tiễn cho đội ngũ, KHÔNG clickbait SEO.

Yêu cầu format:
- Chỉ xuất danh sách, mỗi dòng 1 chủ đề
- 1 dòng = 1 góc viết được (cụ thể hơn tiêu đề tin tức chung)
- Ưu tiên tiếng Việt; thuật ngữ kỹ thuật giữ tiếng Anh khi cần
- Độ dài mỗi dòng ~8–80 ký tự
- Không đánh số, không bullet markdown bắt buộc, không giải thích, không URL
${avoidBlock}
=== WEB SEARCH RESULTS ===
${formatSearchResults(results)}`,
      },
    ],
    { maxTokens: 1200, temperature: 0.4, reasoningEffort: "low" },
  );

  const topics = dedupeLines(parseSeedLines(raw)).slice(0, 30);
  if (topics.length < 12) {
    throw new Error(
      `AI chỉ trả ${topics.length} seed (cần ≥12). Thử lại hoặc kiểm tra NVIDIA.`,
    );
  }

  return {
    topics,
    searchHits: results.length,
    llmMs: Date.now() - llmStarted,
  };
}
