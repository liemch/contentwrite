/**
 * Reset passwordHash (+ active) for ADMIN_EMAIL on the DB in DATABASE_URL.
 *
 * Safety:
 *   RESET_ADMIN_CONFIRM=YES must be set.
 *   Does not print password or DATABASE_URL.
 *
 * Usage:
 *   RESET_ADMIN_CONFIRM=YES node --env-file=.env.local scripts/reset-admin-password.mjs
 *   # or after: vercel env pull .env.production.local --environment=production
 */
import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

try {
  require("dotenv").config({ path: resolve(__dirname, "../.env") });
  require("dotenv").config({ path: resolve(__dirname, "../.env.local") });
  require("dotenv").config({ path: resolve(__dirname, "../.env.production.local") });
} catch {
  /* optional */
}

async function main() {
  if (process.env.RESET_ADMIN_CONFIRM !== "YES") {
    console.error("Refuse: set RESET_ADMIN_CONFIRM=YES to run.");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }
  if (!email) {
    console.error("Missing ADMIN_EMAIL");
    process.exit(1);
  }
  if (!password || password.length < 8) {
    console.error("ADMIN_PASSWORD missing or shorter than 8 chars");
    process.exit(1);
  }

  const { PrismaClient } = require("../src/generated/prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");
  const { hash } = require("bcryptjs");

  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "(unparseable-host)";
    }
  })();

  const pool = new Pool({ connectionString: url });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const legacy = await prisma.user.findUnique({
        where: { email: "admin@local" },
      });
      if (legacy) {
        const passwordHash = await hash(password, 10);
        const updated = await prisma.user.update({
          where: { id: legacy.id },
          data: {
            email,
            passwordHash,
            active: true,
            role: "ADMIN",
          },
        });
        console.log(
          `OK: renamed admin@local → ${updated.email} on host=${host}; active=${updated.active}`,
        );
        return;
      }
      console.error(`No user for ${email} and no admin@local on host=${host}`);
      process.exit(1);
    }

    const passwordHash = await hash(password, 10);
    const updated = await prisma.user.update({
      where: { email },
      data: { passwordHash, active: true },
    });
    console.log(
      `OK: reset password for ${updated.email} on host=${host}; active=${updated.active}`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
