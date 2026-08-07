/**
 * Seed admin đầu tiên từ ADMIN_EMAIL + ADMIN_PASSWORD.
 * Chạy: node --env-file=.env scripts/seed-admin.mjs
 * (hoặc DATABASE_URL đã export)
 */
import { createRequire } from "module";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Load dotenv if present
try {
  require("dotenv").config({ path: resolve(__dirname, "../.env") });
  require("dotenv").config({ path: resolve(__dirname, "../.env.local") });
} catch {
  /* optional */
}

async function main() {
  const { PrismaClient } = require("../src/generated/prisma/client");
  const { PrismaPg } = require("@prisma/adapter-pg");
  const { Pool } = require("pg");
  const { hash } = require("bcryptjs");

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }

  const email = (process.env.ADMIN_EMAIL || "admin@local").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD?.trim();
  if (!password) {
    console.error("Missing ADMIN_PASSWORD");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin already exists: ${email}`);
    await prisma.$disconnect();
    await pool.end();
    return;
  }

  const count = await prisma.user.count();
  const user = await prisma.user.create({
    data: {
      email,
      name: "Admin",
      passwordHash: await hash(password, 10),
      role: "ADMIN",
      dailyArticleLimit: 20,
      active: true,
    },
  });

  // Gán owner auto-write nếu trống
  await prisma.autoWriteConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ownerUserId: user.id },
    update: count === 0 ? { ownerUserId: user.id } : {},
  });

  console.log(`Created ADMIN ${user.email} (${user.id})`);
  await prisma.$disconnect();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
