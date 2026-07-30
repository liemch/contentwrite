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
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPromptFromHeroBrief(heroBrief: string | null | undefined, fallbackTopic: string): string {
  if (!heroBrief?.trim()) {
    return `Minimal abstract editorial tech illustration about ${fallbackTopic}. Soft teal lighting, geometric forms, no text, no people, no logos, no charts with fake numbers.`;
  }

  // Hero brief dạng markdown: **Prompt (English):** "...."
  // (dấu ':' nằm trong đoạn bold, không phải **Prompt** :)
  const promptMatch =
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*"([^"]+)"/i) ||
    heroBrief.match(/\*\*[^*]*Prompt[^*]*:\*\*\s*'([^']+)'/i) ||
    heroBrief.match(/Prompt\s*\(English\)\s*:\*\*\s*"([^"]+)"/i) ||
    heroBrief.match(/English prompt\s*:\s*"([^"]+)"/i) ||
    heroBrief.match(/```(?:text|prompt)?\n([\s\S]*?)```/i);

  const base = stripMd(promptMatch?.[1] || heroBrief).slice(0, 1200);
  return `${base}. Editorial tech magazine hero, abstract, no readable text overlays, no real people, no logos, no fake charts or data visualizations.`;
}

function extractAlt(heroBrief: string | null | undefined, title: string): string {
  const altMatch =
    heroBrief?.match(/\*\*[^*]*Alt[^*]*:\*\*\s*([^\n]+)/i) ||
    heroBrief?.match(/Alt\s*text\s*:\s*([^\n]+)/i);
  return stripMd(altMatch?.[1] || title || "Hero illustration").slice(0, 180);
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

  // flux.1-dev ổn định trên NVIDIA cloud; schnell hay timeout local
  const url = "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-dev";
  const res = await postJsonCurl(
    url,
    { Authorization: `Bearer ${apiKey}` },
    {
      prompt,
      width: 1024,
      height: 1024,
      seed: Math.floor(Math.random() * 1_000_000),
      steps: 28,
    },
    120000,
  );

  if (!res.ok) {
    throw new Error(`FLUX lỗi (${res.status}): ${res.text.slice(0, 240)}`);
  }

  const json = JSON.parse(res.text) as {
    artifacts?: Array<{ base64?: string }>;
  };
  const b64 = json.artifacts?.[0]?.base64;
  if (!b64) throw new Error("FLUX không trả về ảnh");
  const buffer = Buffer.from(b64, "base64");
  // Flux đôi khi trả JPEG đen ~6KB khi prompt dính markdown/ký tự lạ
  if (buffer.length < 12_000) {
    throw new Error(
      "FLUX trả ảnh rỗng/đen — thử lại hoặc rút gọn Hero Brief (prompt English sạch, không markdown).",
    );
  }
  return buffer;
}

async function generateWithQwen(prompt: string): Promise<Buffer> {
  const falKey = process.env.FAL_KEY || process.env.FAL_API_KEY;
  if (!falKey) {
    throw new Error(
      "Qwen-Image cần FAL_KEY (fal.ai). NVIDIA cloud hiện không có qwen-image cho key này.",
    );
  }

  // Sync endpoint fal.run
  const res = await postJsonCurl(
    "https://fal.run/fal-ai/qwen-image",
    { Authorization: `Key ${falKey}` },
    {
      prompt,
      image_size: "square_hd",
      num_inference_steps: 30,
      guidance_scale: 3.5,
      enable_safety_checker: true,
    },
    180000,
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

async function saveHeroImage(articleId: string, model: HeroImageModel, buffer: Buffer) {
  const dir = join(process.cwd(), "public", "generated", "heroes");
  await mkdir(dir, { recursive: true });
  const filename = `${articleId}-${model}-${Date.now()}.jpg`;
  const abs = join(dir, filename);
  await writeFile(abs, buffer);
  return `/generated/heroes/${filename}`;
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
  const mdImage = `![${alt}](${imageUrl})`;
  let body = cleanPublish;
  if (/!\[[^\]]*]\(\s*HERO_IMAGE\s*\)/.test(body)) {
    body = body.replace(/!\[[^\]]*]\(\s*HERO_IMAGE\s*\)/, mdImage);
    return body;
  }
  if (/\bHERO_IMAGE\b/.test(body)) {
    body = body.replace(/\bHERO_IMAGE\b/g, imageUrl);
    return body;
  }
  // Bỏ ảnh hero cũ ở đầu (nếu re-gen)
  body = body.replace(/^\s*!\[[^\]]*]\([^)]+\)\s*/m, "").trimStart();
  return `${mdImage}\n\n${body}`;
}
