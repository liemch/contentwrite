/**
 * Validate WP2.7 cohort manifest before running metrics report.
 *
 * Usage:
 *   node scripts/validate-cohort-manifest.mjs scripts/cohort-manifest.example.json
 *   node scripts/validate-cohort-manifest.mjs my-cohort.json --strict
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REQUIRED = ["cohortId", "protocolVersion", "articleIds"];
const OPTIONAL_TARGETS = [
  "minArticles",
  "minDomains",
  "minFeedbackResponses",
  "maxMetaLeakRate",
];

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`✓ ${message}`);
}

async function main() {
  const pathArg = process.argv[2];
  const strict = process.argv.includes("--strict");
  if (!pathArg) {
    fail("Cần đường dẫn manifest: node scripts/validate-cohort-manifest.mjs <file.json>");
    return;
  }

  const raw = await readFile(resolve(pathArg), "utf8");
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    fail("Manifest không phải JSON hợp lệ");
    return;
  }

  for (const key of REQUIRED) {
    if (!(key in manifest)) fail(`Thiếu field bắt buộc: ${key}`);
  }
  if (!Array.isArray(manifest.articleIds)) {
    fail("articleIds phải là mảng");
    return;
  }

  const ids = [...new Set(manifest.articleIds)].filter(
    (id) => typeof id === "string" && id.trim(),
  );
  if (ids.length !== manifest.articleIds.length) {
    fail("articleIds có phần tử trùng hoặc không phải string");
  }

  if (manifest.targets && typeof manifest.targets !== "object") {
    fail("targets phải là object");
  }

  const minArticles = manifest.targets?.minArticles ?? 10;
  if (strict && ids.length < minArticles) {
    fail(`Strict: cần ≥${minArticles} articleIds (hiện ${ids.length})`);
  } else if (ids.length === 0) {
    ok("Manifest hợp lệ — chưa có articleIds (điền sau khi chạy bài)");
  } else {
    ok(`${ids.length} articleIds (target min ${minArticles})`);
  }

  if (manifest.aiTfesVersion && !["v1.6", "v2-rc1", "v2-rc2"].includes(manifest.aiTfesVersion)) {
    fail("aiTfesVersion phải là v1.6, v2-rc1 hoặc v2-rc2");
  }

  for (const key of OPTIONAL_TARGETS) {
    if (manifest.targets?.[key] != null) ok(`targets.${key} = ${manifest.targets[key]}`);
  }

  if (!process.exitCode) {
    ok(`cohortId=${manifest.cohortId}, protocol=${manifest.protocolVersion}`);
    console.log("\nTiếp theo:");
    console.log(
      `  npm run db:report:remediation -- --manifest ${pathArg} --format md`,
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
