export function excerptFromMarkdown(markdown: string | null | undefined, max = 160): string {
  if (!markdown) return "";
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= max) return plain;
  return `${plain.slice(0, max).trimEnd()}…`;
}

export function readingMinutes(markdown: string | null | undefined): number {
  if (!markdown) return 1;
  const words = markdown.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}
