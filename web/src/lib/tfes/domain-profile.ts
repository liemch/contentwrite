import { resolveDomainId } from "@/lib/tfes/domains";

const REQUIRED_SECTIONS = [
  "profile_version",
  "identity",
  "audience",
  "tone",
  "source_tiers",
  "example_strategy",
  "categories",
  "scoring_weights",
  "sensitivity",
  "freshness",
  "seed_topics",
  "gold_samples",
] as const;

function sections(markdown: string): Map<string, string> {
  const result = new Map<string, string>();
  const matches = [...markdown.matchAll(/^##\s+([^\n]+)\s*$/gm)];
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    // Allow annotated headers like "## source_tiers (KHÁC …)" → key "source_tiers".
    const key = match[1]
      ?.trim()
      .toLowerCase()
      .replace(/\s*\(.*\)\s*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!key || match.index == null) continue;
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? markdown.length;
    result.set(key, markdown.slice(start, end).trim());
  }
  return result;
}

function scoringWeightTotal(value: string): number {
  const declaration = value.split("\n").find((line) => line.trim() && !line.trim().startsWith(">")) ?? "";
  return [...declaration.matchAll(/\b(\d{1,3})\b/g)]
    .map((match) => Number(match[1]))
    .reduce((sum, value) => sum + value, 0);
}

export function resolveAndValidateDomainProfile(
  domain: string,
  read: (path: string) => string,
): { content: string; version: string } {
  const id = resolveDomainId(domain);
  const base = sections(read("04-Domain-Profiles/engineering.md"));
  const child = id === "engineering" ? new Map<string, string>() : sections(read(`04-Domain-Profiles/${id}.md`));
  const merged = new Map(base);
  for (const [key, value] of child) merged.set(key, value);

  const missing = REQUIRED_SECTIONS.filter((key) => !merged.get(key)?.trim());
  if (missing.length > 0) {
    throw new Error(`Domain Profile ${id} thiếu field: ${missing.join(", ")}`);
  }
  const weights = scoringWeightTotal(merged.get("scoring_weights") ?? "");
  if (weights !== 100) {
    throw new Error(`Domain Profile ${id}: scoring_weights phải tổng 100 (hiện ${weights})`);
  }
  const goldCount = (merged.get("gold_samples") ?? "").match(/^###\s+Sample/igm)?.length ?? 0;
  if (goldCount < 2) {
    throw new Error(`Domain Profile ${id}: gold_samples cần tối thiểu 2 mẫu`);
  }

  const content = [
    `# Resolved Domain Profile: ${id}`,
    ...[...merged].map(([key, value]) => `## ${key}\n${value}`),
  ].join("\n\n");
  return { content, version: merged.get("profile_version")?.split(/\s+/)[0] ?? "1.6" };
}

/** Prefer identity/audience/tone/source/sensitivity/blocklist over long gold/seed tails. */
export function clipDomainProfileForRole(
  profileMarkdown: string,
  maxChars: number,
): string {
  const preferred = [
    "identity",
    "audience",
    "tone",
    "source_tiers",
    "sensitivity",
    "pseudoscience_blocklist",
    "categories",
    "scoring_weights",
    "example_strategy",
    "freshness",
  ];
  const map = sections(profileMarkdown);
  const chunks: string[] = [];
  for (const key of preferred) {
    const value = map.get(key)?.trim();
    if (!value) continue;
    chunks.push(`## ${key}\n${value}`);
  }
  const assembled = chunks.join("\n\n").trim();
  if (assembled.length >= Math.min(400, maxChars)) {
    return assembled.slice(0, maxChars).trim();
  }
  return profileMarkdown.slice(0, maxChars).trim();
}
