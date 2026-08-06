/**
 * Report Series rows with createdById IS NULL (legacy ownership).
 *
 * Default: dry-run report only — does NOT assign owners.
 *
 * Usage:
 *   node --env-file=.env scripts/report-series-without-owner.mjs
 *   node --env-file=.env scripts/report-series-without-owner.mjs --json
 *
 * Optional apply (admin must supply explicit mapping file — not implemented here):
 *   Manual SQL example after review:
 *     UPDATE "Series" SET "createdById" = '<admin-user-id>' WHERE "id" = '<series-id>';
 */
import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

try {
  require("dotenv").config({ path: resolve(__dirname, "../.env") });
  require("dotenv").config({ path: resolve(__dirname, "../.env.local") });
} catch {
  /* optional */
}

const jsonOut = process.argv.includes("--json");

async function main() {
  const { PrismaClient } = require("../src/generated/prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const withoutOwner = await prisma.series.findMany({
      where: { createdById: null },
      select: {
        id: true,
        title: true,
        slug: true,
        domain: true,
        createdAt: true,
        _count: { select: { articles: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const withOwner = await prisma.series.count({
      where: { createdById: { not: null } },
    });
    const total = withOwner + withoutOwner.length;

    const payload = {
      mode: "dry-run",
      generatedAt: new Date().toISOString(),
      totals: {
        series: total,
        withOwner,
        withoutOwner: withoutOwner.length,
      },
      seriesWithoutOwner: withoutOwner.map((s) => ({
        id: s.id,
        title: s.title,
        slug: s.slug,
        domain: s.domain,
        createdAt: s.createdAt.toISOString(),
        articleCount: s._count.articles,
      })),
      guidance:
        "Legacy Series (createdById NULL) are admin-only for writes. Assign owner manually via SQL or admin tooling after identifying the correct user.",
    };

    if (jsonOut) {
      console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log("=== Series ownership report (dry-run) ===");
      console.log(`Total Series: ${total}`);
      console.log(`With owner:   ${withOwner}`);
      console.log(`Without owner: ${withoutOwner.length}`);
      console.log("");
      if (withoutOwner.length === 0) {
        console.log("No legacy Series without owner.");
      } else {
        console.log("Series missing createdById:");
        for (const s of withoutOwner) {
          console.log(
            `  - ${s.slug} (${s.id}) | "${s.title}" | articles=${s._count.articles} | created=${s.createdAt.toISOString()}`
          );
        }
        console.log("");
        console.log(payload.guidance);
      }
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
