/**
 * Normalization layer for marked machine contracts.
 *
 * Runs before contract validation so parsers stay strict about meaning while
 * tolerating harmless formatting drift (fences, prose wrappers, numeric
 * strings, enum casing). Anything ambiguous stays malformed on purpose.
 */

export type MarkedJsonReason =
  | "ok"
  | "marker-missing"
  | "json-missing"
  | "json-unparseable"
  | "json-truncated";

export type MarkedJsonResult = {
  json: Record<string, unknown> | null;
  reason: MarkedJsonReason;
  /** Marked blocks found; >1 means the model emitted duplicate machine blocks. */
  blockCount: number;
  /** A marked object opened but never closed — usually a truncated response. */
  truncated: boolean;
  /** Salvage normalization was required to parse (trailing comma, raw newline). */
  repaired: boolean;
};

function markerIndexes(body: string, marker: string): number[] {
  const found: number[] = [];
  let from = 0;
  for (;;) {
    const index = body.indexOf(marker, from);
    if (index < 0) break;
    found.push(index);
    from = index + marker.length;
  }
  return found;
}

function stripFence(text: string): string {
  const trimmed = text.trimStart();
  if (!trimmed.startsWith("```")) return trimmed;
  const withoutOpen = trimmed.replace(/^```[a-z]*\s*/i, "");
  const close = withoutOpen.indexOf("```");
  return close < 0 ? withoutOpen : withoutOpen.slice(0, close);
}

/**
 * String-aware salvage: drops trailing commas and escapes raw newlines inside
 * strings. Both keep the meaning of the object identical.
 */
function salvageJson(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        out += char;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        out += char;
        continue;
      }
      if (char === '"') {
        inString = false;
        out += char;
        continue;
      }
      if (char === "\n") {
        out += "\\n";
        continue;
      }
      if (char === "\r") continue;
      if (char === "\t") {
        out += "\\t";
        continue;
      }
      out += char;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === ",") {
      const rest = text.slice(index + 1);
      const nextIndex = rest.search(/\S/);
      if (nextIndex >= 0 && (rest[nextIndex] === "}" || rest[nextIndex] === "]")) {
        continue;
      }
    }
    out += char;
  }
  return out;
}

function asObject(parsed: unknown): Record<string, unknown> | null {
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
}

type BlockScan = {
  object: Record<string, unknown> | null;
  truncated: boolean;
  repaired: boolean;
  hasBrace: boolean;
};

function scanBlock(candidate: string): BlockScan {
  const start = candidate.indexOf("{");
  if (start < 0) {
    return { object: null, truncated: false, repaired: false, hasBrace: false };
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth !== 0) continue;
    const slice = candidate.slice(start, index + 1);
    try {
      const object = asObject(JSON.parse(slice));
      if (object) {
        return { object, truncated: false, repaired: false, hasBrace: true };
      }
    } catch {
      // fall through to salvage
    }
    try {
      const object = asObject(JSON.parse(salvageJson(slice)));
      return {
        object,
        truncated: false,
        repaired: object !== null,
        hasBrace: true,
      };
    } catch {
      return { object: null, truncated: false, repaired: false, hasBrace: true };
    }
  }
  // Object opened and never closed within the response body.
  return { object: null, truncated: true, repaired: false, hasBrace: true };
}

/**
 * Extract the marked JSON object. The last parseable block wins so an echoed
 * template block before the real answer never overrides it.
 */
export function extractMarkedJson(
  raw: string | null | undefined,
  marker: string,
): MarkedJsonResult {
  const body = raw ?? "";
  const indexes = markerIndexes(body, marker);
  if (indexes.length === 0) {
    return {
      json: null,
      reason: "marker-missing",
      blockCount: 0,
      truncated: false,
      repaired: false,
    };
  }
  let truncated = false;
  let sawBrace = false;
  for (let position = indexes.length - 1; position >= 0; position -= 1) {
    const after = body.slice(indexes[position] + marker.length);
    const scan = scanBlock(stripFence(after));
    sawBrace = sawBrace || scan.hasBrace;
    truncated = truncated || scan.truncated;
    if (scan.object) {
      return {
        json: scan.object,
        reason: "ok",
        blockCount: indexes.length,
        truncated: false,
        repaired: scan.repaired,
      };
    }
  }
  return {
    json: null,
    reason: truncated
      ? "json-truncated"
      : sawBrace
        ? "json-unparseable"
        : "json-missing",
    blockCount: indexes.length,
    truncated,
    repaired: false,
  };
}

/** Accepts numbers, numeric strings, and `n/max` notation. Never guesses. */
export function coerceMachineInteger(
  value: unknown,
  options: { min: number; max: number },
): number | null {
  const inRange = (candidate: number): number | null =>
    Number.isFinite(candidate) &&
    candidate >= options.min &&
    candidate <= options.max
      ? Math.round(candidate)
      : null;
  if (typeof value === "number") return inRange(value);
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d{1,3}(?:\.\d+)?$/.test(text)) return inRange(Number(text));
  const fraction = text.match(/^(\d{1,3}(?:\.\d+)?)\s*\/\s*(\d{1,3})$/);
  if (fraction && Number(fraction[2]) === options.max) {
    return inRange(Number(fraction[1]));
  }
  return null;
}

/** Uppercases, collapses separators, then requires an exact enum match. */
export function coerceMachineEnum(
  value: unknown,
  allowed: readonly string[],
  aliases: Record<string, string> = {},
): string {
  if (typeof value !== "string") return "";
  const normalized = value
    .trim()
    .replace(/[`*"']/g, "")
    .replace(/[\s\-–—]+/g, "_")
    .replace(/[.:;,]+$/, "")
    .toUpperCase();
  const resolved = aliases[normalized] ?? normalized;
  return allowed.includes(resolved) ? resolved : "";
}

export function coerceMachineBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const text = value.trim().toLowerCase();
  if (text === "true" || text === "yes") return true;
  if (text === "false" || text === "no") return false;
  return null;
}

/** Response ends mid-token — a truncation signal when no contract was found. */
export function looksTruncated(raw: string | null | undefined): boolean {
  const body = (raw ?? "").trimEnd();
  if (!body) return false;
  return !/[}\]>"”'.!?)\u2026]$/.test(body);
}
