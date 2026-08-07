/**
 * Read-only WP2.7 cohort report.
 *
 * Usage:
 *   node --env-file=.env scripts/report-remediation-metrics.mjs --manifest cohort.json --format json
 *   node --env-file=.env scripts/report-remediation-metrics.mjs --since 2026-08-07 --until 2026-09-07 --format md
 */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { aggregateRemediationMetrics } from "./lib/remediation-metrics.mjs";

const require = createRequire(import.meta.url);

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function flatten(value, prefix = "", result = []) {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, result);
    } else {
      result.push([path, child]);
    }
  }
  return result;
}

function csvCell(value) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function render(payload, format) {
  if (format === "json") return JSON.stringify(payload, null, 2);
  const rows = flatten(payload.metrics);
  if (format === "csv") {
    return ["metric,value", ...rows.map(([key, value]) => `${csvCell(key)},${csvCell(value)}`)]
      .join("\n");
  }
  return [
    "# WP2.7 Remediation Metrics",
    "",
    `Generated: ${payload.generatedAt}`,
    `Selection: ${payload.selection}`,
    "",
    "| Metric | Value |",
    "|---|---:|",
    ...rows.map(([key, value]) => `| ${key} | ${value ?? "n/a"} |`),
    "",
  ].join("\n");
}

async function main() {
  const manifestPath = argument("manifest");
  const sinceArg = argument("since");
  const untilArg = argument("until");
  const format = argument("format", "json");
  if (!["json", "csv", "md"].includes(format)) {
    throw new Error("--format phải là json, csv hoặc md");
  }
  if (!manifestPath && !sinceArg) {
    throw new Error("Cần --manifest <file.json> hoặc --since <ISO date>; script không quét toàn DB mặc định");
  }

  let articleIds = null;
  if (manifestPath) {
    const manifest = JSON.parse(await readFile(resolve(manifestPath), "utf8"));
    articleIds = [...new Set(manifest.articleIds ?? [])].filter(
      (id) => typeof id === "string" && id.trim(),
    );
    if (articleIds.length === 0) throw new Error("Manifest không có articleIds");
  }
  const since = sinceArg ? new Date(sinceArg) : null;
  const until = untilArg ? new Date(untilArg) : null;
  if (since && Number.isNaN(since.getTime())) throw new Error("--since không hợp lệ");
  if (until && Number.isNaN(until.getTime())) throw new Error("--until không hợp lệ");

  const { PrismaClient } = require("../src/generated/prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Missing DATABASE_URL");

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const articles = await prisma.article.findMany({
      where: articleIds
        ? { id: { in: articleIds } }
        : {
            createdAt: {
              gte: since,
              ...(until ? { lt: until } : {}),
            },
          },
      select: {
        id: true,
        domain: true,
        workflowState: true,
        targetWordCount: true,
        deskJson: true,
        createdAt: true,
        approvedAt: true,
        publishedAt: true,
        transitions: {
          orderBy: { createdAt: "asc" },
          select: {
            action: true,
            success: true,
            fromState: true,
            toState: true,
            details: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });
    const payload = {
      generatedAt: new Date().toISOString(),
      mode: "read-only",
      selection: articleIds
        ? `manifest:${resolve(manifestPath)}`
        : `createdAt:[${since.toISOString()},${until?.toISOString() ?? "now"})`,
      metrics: aggregateRemediationMetrics(articles),
    };
    process.stdout.write(`${render(payload, format)}\n`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
