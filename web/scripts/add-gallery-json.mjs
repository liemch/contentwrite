/**
 * Thêm cột Article.galleryJson (ảnh hero + inline, tối đa 5).
 *
 * Chạy (có DATABASE_URL):
 *   node --env-file=.env scripts/add-gallery-json.mjs
 * hoặc:
 *   npm run db:add-gallery
 *
 * Script idempotent — chạy lại không lỗi nếu cột đã có.
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
    console.error("Missing DATABASE_URL (.env hoặc export trước khi chạy)");
    process.exit(1);
  }

  const sqlPath = resolve(
    __dirname,
    "../prisma/sql/20260801_add_article_gallery_json.sql",
  );
  const sql = readFileSync(sqlPath, "utf8");

  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    const check = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'Article' AND column_name = 'galleryJson'
    `);
    if (check.rowCount === 0) {
      throw new Error("Cột galleryJson chưa thấy sau khi ALTER — kiểm tra quyền DB");
    }
    console.log("OK — Article.galleryJson:", check.rows[0]);
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
