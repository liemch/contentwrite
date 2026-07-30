import { readTfesFile } from "@/lib/tfes/prompts";

export type AutoWriteSettings = {
  enabled: boolean;
  scheduleMode: "interval" | "daily";
  intervalHours: number;
  preferredHour: number;
  timezone: string;
  domain: "engineering" | "soft-skills" | "rotate";
  useSeedTopics: boolean;
  customTopics: string;
  maxPendingReview: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastError: string | null;
  lastArticleId: string | null;
  lastDomain: string | null;
};

export function parseSeedTopics(domain: "engineering" | "soft-skills"): string[] {
  try {
    const file =
      domain === "soft-skills"
        ? "04-Domain-Profiles/soft-skills.md"
        : "04-Domain-Profiles/engineering.md";
    const md = readTfesFile(file);
    const match = md.match(/##\s*seed_topics\s*\n([\s\S]*?)(?=\n##\s|$)/i);
    if (!match?.[1]) return [];
    return match[1]
      .split(/[·•|\n]/)
      .map((s) => s.replace(/^[-*]\s*/, "").trim())
      .filter((s) => s.length > 3);
  } catch {
    return [];
  }
}

export function parseCustomTopics(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\n/)
    .map((s) => s.replace(/^[-*]\s*/, "").trim())
    .filter((s) => s.length > 2);
}

function zonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(date)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Wall-clock trong timezone → Date UTC */
function zonedWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 40; i++) {
    const p = zonedParts(new Date(utc), timeZone);
    const asMinutes =
      Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 60000;
    const targetMinutes = Date.UTC(year, month - 1, day, hour, minute, 0) / 60000;
    const diffMin = targetMinutes - asMinutes;
    if (Math.abs(diffMin) < 0.5) return new Date(utc);
    utc += diffMin * 60000;
  }
  return new Date(utc);
}

export function computeNextRunAt(input: {
  scheduleMode: "interval" | "daily";
  intervalHours: number;
  preferredHour: number;
  timezone: string;
  from?: Date;
}): Date {
  const from = input.from ?? new Date();

  if (input.scheduleMode === "interval") {
    const hours = Math.max(1, Math.min(168, input.intervalHours || 24));
    return new Date(from.getTime() + hours * 60 * 60 * 1000);
  }

  const hour = Math.max(0, Math.min(23, input.preferredHour ?? 9));
  const tz = input.timezone || "Asia/Ho_Chi_Minh";
  const p = zonedParts(from, tz);

  let y = p.year;
  let m = p.month;
  let d = p.day;
  if (p.hour > hour || (p.hour === hour && p.minute > 0)) {
    const tomorrow = zonedWallToUtc(y, m, d, 12, 0, tz);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tp = zonedParts(tomorrow, tz);
    y = tp.year;
    m = tp.month;
    d = tp.day;
  }

  return zonedWallToUtc(y, m, d, hour, 0, tz);
}

export function isDue(nextRunAt: Date | null | undefined, now = new Date()): boolean {
  if (!nextRunAt) return true;
  return nextRunAt.getTime() <= now.getTime();
}
