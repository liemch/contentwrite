/**
 * Test NVIDIA NIM chat
 *
 *   cd web
 *   node --env-file=.env scripts/test-nvidia.mjs
 */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiKey = process.env.NVIDIA_API_KEY;
const baseURL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const model = process.env.NVIDIA_MODEL || "z-ai/glm-5.2";

if (!apiKey) {
  console.error("❌ Thiếu NVIDIA_API_KEY trong .env");
  process.exit(1);
}

console.log("Base URL:", baseURL);
console.log("Model:   ", model);
console.log("Key:     ", apiKey.slice(0, 8) + "***");
console.log("--- curl stream (cách local ổn định) ---\n");

const started = Date.now();
const dir = await mkdtemp(join(tmpdir(), "cth-nv-test-"));
const bodyPath = join(dir, "body.json");

await writeFile(
  bodyPath,
  JSON.stringify({
    model,
    messages: [{ role: "user", content: "Trả lời đúng một từ: OK" }],
    temperature: 1,
    top_p: 1,
    max_tokens: 32,
    seed: 42,
    stream: true,
  }),
  "utf8",
);

try {
  const raw = await new Promise((resolve, reject) => {
    const child = spawn(
      "curl",
      [
        "-4",
        "-s",
        "-N",
        "--connect-timeout",
        "30",
        "--max-time",
        "120",
        "-X",
        "POST",
        `${baseURL}/chat/completions`,
        "-H",
        `Authorization: Bearer ${apiKey}`,
        "-H",
        "Content-Type: application/json",
        "-H",
        "Accept: text/event-stream",
        "--data-binary",
        `@${bodyPath}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let out = "";
    let err = "";
    child.stdout.on("data", (b) => {
      const s = b.toString("utf8");
      out += s;
      process.stdout.write(s.includes("data:") ? "" : s);
    });
    child.stderr.on("data", (b) => {
      err += b.toString("utf8");
    });
    child.on("close", (code) => {
      if (code !== 0 && !out.includes("data:")) reject(new Error(err || `curl exit ${code}`));
      else resolve(out);
    });
  });

  let text = "";
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const payload = t.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      const piece = json.choices?.[0]?.delta?.content || "";
      if (piece) {
        process.stdout.write(piece);
        text += piece;
      }
    } catch {
      /* ignore */
    }
  }

  console.log("\n\n---");
  console.log(text.trim() ? "✅ Thành công" : "⚠️ Không có nội dung");
  console.log(`⏱ ${(Date.now() - started) / 1000}s`);
} catch (error) {
  console.error("\n❌ Lỗi:", error.message || error);
  process.exit(1);
} finally {
  await rm(dir, { recursive: true, force: true });
}
