/**
 * Thêm cột Article.deskJson (fact human + edit meta).
 *   node --env-file=.env scripts/add-desk-json.mjs
 * hoặc npm run db:add-desk
 */
import { createRequire } from "module";
import { readFileSync } from "fs";
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

async function main() {
  const { Pool } = require("pg");
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Missing DATABASE_URL");
    process.exit(1);
  }
  const sql = readFileSync(
    resolve(__dirname, "../prisma/sql/20260801_add_article_desk_json.sql"),
    "utf8",
  );
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("OK — Article.deskJson");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("FAIL:", err instanceof Error ? err.message : err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
