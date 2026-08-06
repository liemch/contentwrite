const DEFAULT_PATH = "/dashboard";

/** Allow only same-origin relative paths (no open redirect). */
export function safeInternalPath(
  next: string | null | undefined,
  fallback = DEFAULT_PATH,
): string {
  if (!next || typeof next !== "string") return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return fallback;
  if (trimmed.includes(":\\") || trimmed.includes("@")) return fallback;
  return trimmed;
}
