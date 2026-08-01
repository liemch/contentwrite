import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolveHeroPrompt, resolveImageAlt, sanitizeFluxPrompt } from "@/lib/image/hero-prompt";
import { injectGalleryIntoCleanPublish, type GalleryImage } from "@/lib/image/gallery";

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

async function generateWithFlux(prompt: string, topicHint?: string): Promise<Buffer> {
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
        cfg_scale: 4,
        // Landscape gần 16:9 trong enum API
        width: 1344,
        height: 768,
        seed,
        steps: 35,
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

  const topic = (topicHint || "the article thesis").slice(0, 140);
  const topicFallback = sanitizeFluxPrompt(
    `Symbolic editorial magazine illustration about ${topic}. Concrete visual metaphor, cinematic soft light, muted teal and ink tones, no text or logos`,
    topic,
  );

  try {
    return await once(prompt, Math.floor(Math.random() * 1_000_000));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    // Ảnh đen / filter → thử lại với prompt ngắn VẪN neo topic (không generic circuit board)
    if (msg === "FLUX_BLACK" || /chặn|FILTER|NSFW|rỗng|đen/i.test(msg)) {
      try {
        return await once(topicFallback, Math.floor(Math.random() * 1_000_000));
      } catch (retryErr) {
        const r = retryErr instanceof Error ? retryErr.message : String(retryErr);
        if (r === "FLUX_BLACK") {
          throw new Error(
            "FLUX trả ảnh rỗng/đen sau 2 lần. Bấm «Gợi ý từ bài» rồi gen lại với prompt ngắn hơn.",
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
  cleanPublish?: string | null;
  /** Prompt English do user chỉnh — ưu tiên hơn extract từ Hero Brief */
  promptOverride?: string | null;
  altOverride?: string | null;
  conceptVi?: string | null;
}) {
  const prompt = resolveHeroPrompt({
    promptOverride: input.promptOverride,
    heroBrief: input.heroBrief,
    topic: input.topic,
    title: input.title,
    cleanPublish: input.cleanPublish,
  });
  const alt = resolveImageAlt({
    altOverride: input.altOverride,
    heroBrief: input.heroBrief,
    title: input.title,
    topic: input.topic,
    conceptVi: input.conceptVi,
  });

  const topicHint = input.title || input.topic || undefined;
  const buffer =
    input.model === "flux"
      ? await generateWithFlux(prompt, topicHint || undefined)
      : await generateWithQwen(prompt);

  const url = await saveHeroImage(input.articleId, input.model, buffer);

  return {
    url,
    model: input.model,
    modelLabel: HERO_MODELS[input.model].label,
    prompt,
    alt,
  };
}

/** @deprecated dùng injectGalleryIntoCleanPublish — giữ export tên cũ */
export function injectHeroIntoCleanPublish(
  cleanPublish: string | null | undefined,
  imageUrl: string,
  alt: string,
) {
  const hero: GalleryImage = {
    id: "hero",
    role: "hero",
    url: imageUrl,
    alt,
    prompt: "",
    modelLabel: "",
    createdAt: new Date().toISOString(),
  };
  return injectGalleryIntoCleanPublish(cleanPublish, [hero]);
}

export { injectGalleryIntoCleanPublish };

