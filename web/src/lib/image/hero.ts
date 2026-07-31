import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

export type HeroImageModel = "flux" | "qwen";

export const HERO_MODELS: Record<
  HeroImageModel,
  { label: string; provider: string; description: string }
> = {
  flux: {
    label: "FLUX.1-dev",
    provider: "NVIDIA",
    description: "Nhanh · đẹp · hợp hero abstract",
  },
  qwen: {
    label: "Qwen-Image",
    provider: "fal.ai",
    description: "Mạnh text-in-image · cần FAL_KEY",
  },
};

function stripMd(value: string): string {
  return value
    .replace(/\*\*/g, "")
    .replace(/`+/g, "")
    .replace(/^#+\s*/gm, "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prompt ngắn, ASCII-heavy — FLUX cloud hay trả ảnh đen nếu nhồi markdown/VI/cấm đoán dài */
function sanitizeFluxPrompt(raw: string, topic: string): string {
  let p = stripMd(raw)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[^\x20-\x7E]/g, " ") // bỏ non-ASCII (VI / ký tự lạ)
    .replace(/\s+/g, " ")
    .trim();

  // Cắt cụm “no X” quá nhiều — dễ kích safety / ảnh đen
  p = p
    .replace(/\bno\s+(readable\s+)?text[^.]*\.?/gi, "")
    .replace(/\bno\s+real\s+people[^.]*\.?/gi, "")
    .replace(/\bno\s+logos?[^.]*\.?/gi, "")
    .replace(/\bno\s+fake\s+charts?[^.]*\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (p.length < 24) {
    p = `Minimal abstract editorial tech illustration about ${topic}. Soft teal geometric forms, magazine hero composition.`;
  }

  // FLUX NIM: prompt rõ, vừa phải — quá dài dễ fail im lặng
  p = p.slice(0, 480).trim();
  if (!/[.!?]$/.test(p)) p = `${p}.`;
  return `${p} Clean abstract editorial style, soft lighting.`;
}

/** Lấy prompt English sạch — tránh nhồi cả Hero Brief (markdown/VI) vào FLUX → ảnh đen */
function extractPromptFromHeroBrief(heroBrief: string | null | undefined, fallbackTopic: string): string {
  const topic = fallbackTopic.slice(0, 80) || "technology";
  const fallback = `Minimal abstract editorial tech illustration about ${topic}. Soft teal lighting, geometric forms, magazine cover mood.`;

  if (!heroBrief?.trim()) return sanitizeFluxPrompt(fallback, topic);

  const promptMatch =
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*"([^"]+)"/i) ||
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*'([^']+)'/i) ||
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*([^\n]+)/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:?\s*"([^"]+)"/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:?\s*'([^']+)'/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:?\s*([^\n]+)/i) ||
    heroBrief.match(/English prompt\s*:\s*"([^"]+)"/i) ||
    heroBrief.match(/English prompt\s*:\s*([^\n]+)/i) ||
    heroBrief.match(/```(?:text|prompt)?\n([\s\S]*?)```/i);

  let base = stripMd(promptMatch?.[1] || "");

  if (base.length < 40) {
    const englishLines = heroBrief
      .split(/\n+/)
      .map((l) => stripMd(l))
      .filter((l) => l.length > 40 && /[a-zA-Z]{4,}/.test(l) && !/HERO|Concept|Caption|Alt|Status/i.test(l))
      .filter(
        (l) =>
          (l.match(/[a-zA-Z]/g)?.length ?? 0) >
          (l.match(/[àáạảãăằắặẳẵâầấậẩẫèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi)?.length ??
            0) *
            2,
      );
    base = englishLines.sort((a, b) => b.length - a.length)[0] || "";
  }

  if (base.length < 24) base = fallback;
  return sanitizeFluxPrompt(base, topic);
}

function extractAlt(heroBrief: string | null | undefined, title: string): string {
  const altMatch =
    heroBrief?.match(/\*\*[^*]*Alt[^*]*:\*\*\s*([^\n]+)/i) ||
    heroBrief?.match(/Alt\s*text\s*:\s*([^\n]+)/i) ||
    heroBrief?.match(/^Alt:\s*([^\n]+)/im);
  return stripMd(altMatch?.[1] || title || "Hero illustration").slice(0, 180);
}

function decodeFluxBase64(raw: unknown): Buffer | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let b64 = raw.trim();
  const dataIdx = b64.indexOf("base64,");
  if (dataIdx >= 0) b64 = b64.slice(dataIdx + 7);
  b64 = b64.replace(/\s+/g, "");
  try {
    const buf = Buffer.from(b64, "base64");
    return buf.length > 100 ? buf : null;
  } catch {
    return null;
  }
}

/** JPEG/PNG quá nhỏ với 1344×768 ≈ ảnh đen / placeholder safety */
function isLikelyEmptyOrBlackImage(buffer: Buffer): boolean {
  if (buffer.length < 18_000) return true;
  // PNG gần đen: nhiều byte 0 ở IDAT vẫn lớn — kiểm tra entropy thô
  let zeros = 0;
  const sample = Math.min(buffer.length, 4000);
  for (let i = 0; i < sample; i += 17) {
    if (buffer[i] < 8) zeros += 1;
  }
  const checks = Math.ceil(sample / 17);
  return zeros / checks > 0.85 && buffer.length < 80_000;
}

async function postJsonCurl(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 120000) {
  const dir = await mkdtemp(join(tmpdir(), "cth-img-"));
  const bodyPath = join(dir, "body.json");
  await writeFile(bodyPath, JSON.stringify(body), "utf8");

  try {
    const raw = await new Promise<string>((resolve, reject) => {
      const args = [
        "-4",
        "-s",
        "-S",
        "-w",
        "\n__HTTP__:%{http_code}",
        "--connect-timeout",
        "30",
        "--max-time",
        String(Math.ceil(timeoutMs / 1000)),
        "-X",
        "POST",
        url,
        "-H",
        "Content-Type: application/json",
        "-H",
        "Accept: application/json",
        "--data-binary",
        `@${bodyPath}`,
      ];
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === "content-type") continue;
        args.push("-H", `${k}: ${v}`);
      }

      const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (b) => {
        out += b.toString("utf8");
      });
      child.stderr.on("data", (b) => {
        err += b.toString("utf8");
      });
      child.on("close", (code) => {
        if (code !== 0 && !out.includes("{")) {
          reject(new Error(err || `curl exit ${code}`));
          return;
        }
        resolve(out);
      });
    });

    const marker = raw.lastIndexOf("\n__HTTP__:");
    const status = marker >= 0 ? Number(raw.slice(marker + 10).trim()) : 200;
    const text = marker >= 0 ? raw.slice(0, marker) : raw;
    if (!Number.isFinite(status) || status === 0) {
      throw new Error(`Không kết nối được image API (${new URL(url).hostname})`);
    }
    return { status, text, ok: status >= 200 && status < 300 };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function generateWithFlux(prompt: string): Promise<Buffer> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY chưa được cấu hình");

  const url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev";

  async function once(p: string, seed: number): Promise<Buffer> {
    const res = await postJsonCurl(
      url,
      { Authorization: `Bearer ${apiKey}` },
      {
        prompt: p,
        mode: "base",
        cfg_scale: 3.5,
        // Landscape gần 16:9 trong enum API
        width: 1344,
        height: 768,
        seed,
        steps: 28,
        samples: 1,
      },
      110000,
    );

    if (!res.ok) {
      throw new Error(`FLUX lỗi (${res.status}): ${res.text.slice(0, 280)}`);
    }

    let json: {
      artifacts?: Array<{
        base64?: string;
        image?: string;
        b64_json?: string;
        finishReason?: string;
      }>;
      finishReason?: string;
    };
    try {
      json = JSON.parse(res.text) as typeof json;
    } catch {
      throw new Error(`FLUX trả JSON lỗi: ${res.text.slice(0, 200)}`);
    }

    const art = json.artifacts?.[0];
    const reason = (art?.finishReason || json.finishReason || "").toUpperCase();
    if (reason && /FILTER|NSFW|SAFETY|ERROR|REJECT/i.test(reason)) {
      throw new Error(`FLUX bị chặn (${reason}). Rút gọn / đổi Hero Prompt tiếng Anh trung tính.`);
    }

    const buffer =
      decodeFluxBase64(art?.base64) ||
      decodeFluxBase64(art?.image) ||
      decodeFluxBase64(art?.b64_json);

    if (!buffer) {
      throw new Error(
        `FLUX không trả ảnh (artifacts trống). Prompt ~${p.length} ký tự — thử lại hoặc rút Hero Brief.`,
      );
    }
    if (isLikelyEmptyOrBlackImage(buffer)) {
      throw new Error("FLUX_BLACK");
    }
    return buffer;
  }

  const safeFallback = sanitizeFluxPrompt(
    "Abstract soft teal geometric shapes floating over a dark editorial background, technology magazine hero, calm lighting",
    "technology",
  );

  try {
    return await once(prompt, Math.floor(Math.random() * 1_000_000));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Ảnh đen / filter → thử 1 lần với prompt sạch ngắn
    if (msg === "FLUX_BLACK" || /chặn|FILTER|NSFW|rỗng|đen/i.test(msg)) {
      try {
        return await once(safeFallback, Math.floor(Math.random() * 1_000_000));
      } catch (retryErr) {
        const r = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (r === "FLUX_BLACK") {
          throw new Error(
            "FLUX trả ảnh rỗng/đen sau 2 lần. Rút Hero Brief (Prompt English ngắn, không markdown/VI) rồi gen lại.",
          );
        }
        throw retryErr instanceof Error ? retryErr : new Error(r);
      }
    }
    throw error instanceof Error ? error : new Error(msg);
  }
}

async function generateWithQwen(prompt: string): Promise<Buffer> {
  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!falKey) {
    throw new Error(
      "Qwen-Image cần FAL_KEY (fal.ai). NVIDIA cloud hiện không có qwen-image cho key này.",
    );
  }

  const res = await postJsonCurl(
    "https://fal.run/fal-ai/qwen-image",
    { Authorization: `Key ${falKey}` },
    {
      prompt,
      image_size: "landscape_16_9",
      num_inference_steps: 28,
      guidance_scale: 3.5,
      enable_safety_checker: true,
    },
    150000,
  );

  if (!res.ok) {
    throw new Error(`Qwen lỗi (${res.status}): ${res.text.slice(0, 280)}`);
  }

  const json = JSON.parse(res.text) as { images?: Array<{ url?: string }> };
  const imageUrl = json.images?.[0]?.url;
  if (!imageUrl) throw new Error("Qwen không trả URL ảnh");
  return fetchImageBuffer(imageUrl);
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const raw = await new Promise<Buffer>((resolve, reject) => {
    const child = spawn("curl", ["-4", "-s", "--max-time", "60", url], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => chunks.push(b));
    child.stderr.on("data", () => undefined);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error("Không tải được ảnh kết quả"));
      else resolve(Buffer.concat(chunks));
    });
    child.on("error", reject);
  });
  if (raw.length < 100) throw new Error("Ảnh kết quả rỗng");
  return raw;
}

/**
 * Vercel serverless: public/ không persist / dễ read-only → lưu data URL vào DB.
 * Local: ghi file public/generated/heroes.
 */
async function saveHeroImage(articleId: string, model: HeroImageModel, buffer: Buffer) {
  if (process.env.VERCEL || process.env.HERO_STORE === "data-url") {
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }

  try {
    const dir = join(process.cwd(), "public", "generated", "heroes");
    await mkdir(dir, { recursive: true });
    const filename = `${articleId}-${model}-${Date.now()}.jpg`;
    const abs = join(dir, filename);
    await writeFile(abs, buffer);
    return `/generated/heroes/${filename}`;
  } catch {
    // Fallback nếu không ghi được disk
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  }
}

export async function generateHeroImage(input: {
  articleId: string;
  model: HeroImageModel;
  heroBrief?: string | null;
  topic?: string | null;
  title?: string | null;
}) {
  const prompt = extractPromptFromHeroBrief(input.heroBrief, input.topic || input.title || "technology");
  const alt = extractAlt(input.heroBrief, input.title || input.topic || "Hero image");

  const buffer =
    input.model === "flux" ? await generateWithFlux(prompt) : await generateWithQwen(prompt);

  const url = await saveHeroImage(input.articleId, input.model, buffer);

  return {
    url,
    model: input.model,
    modelLabel: HERO_MODELS[input.model].label,
    prompt,
    alt,
  };
}

/** Chèn/ghi đè hero image ở đầu bản sạch */
export function injectHeroIntoCleanPublish(cleanPublish: string | null | undefined, imageUrl: string, alt: string) {
  if (!cleanPublish) return cleanPublish;
  let body = cleanPublish;

  // Data URL quá lớn cho markdown DB — UI render từ heroImageUrl
  if (imageUrl.startsWith("data:")) {
    return body
      .replace(/!\[[^\]]*]\(\s*HERO_IMAGE\s*\)\s*/g, "")
      .replace(/\bHERO_IMAGE\b/g, "")
      .replace(/^\s*!\[[^\]]*]\(data:[^)]+\)\s*/m, "")
      .trimStart();
  }

  const mdImage = `![${alt}](${imageUrl})`;
  if (/!\[[^\]]*]\(\s*HERO_IMAGE\s*\)/.test(body)) {
    body = body.replace(/!\[[^\]]*]\(\s*HERO_IMAGE\s*\)/, mdImage);
    return body;
  }
  if (/\bHERO_IMAGE\b/.test(body)) {
    body = body.replace(/\bHERO_IMAGE\b/g, imageUrl);
    return body;
  }
  body = body.replace(/^\s*!\[[^\]]*]\([^)]+\)\s*/m, "").trimStart();
  return `${mdImage}\n\n${body}`;
}
