import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const BASE_URL =
  process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const MODEL = process.env.NVIDIA_MODEL ?? "z-ai/glm-5.2";

function getClient() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY chưa được cấu hình");
  }

  return new OpenAI({
    apiKey,
    baseURL: BASE_URL,
    timeout: process.env.VERCEL ? 55_000 : 300_000,
    maxRetries: 0,
  });
}

function buildBody(messages: ChatMessage[], options?: { temperature?: number; maxTokens?: number }) {
  return {
    model: MODEL,
    messages,
    temperature: options?.temperature ?? 1,
    top_p: 1,
    max_tokens: options?.maxTokens ?? 16384,
    seed: 42,
    stream: true,
  };
}

/** Local fallback: Node fetch hay timeout → curl -N stream SSE */
async function chatViaCurlStream(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY chưa được cấu hình");
  }

  const dir = await mkdtemp(join(tmpdir(), "cth-nv-"));
  const bodyPath = join(dir, "body.json");
  await writeFile(bodyPath, JSON.stringify(buildBody(messages, options)), "utf8");

  try {
    const content = await new Promise<string>((resolve, reject) => {
      const args = [
        "-4",
        "-s",
        "-N",
        "--connect-timeout",
        "30",
        "--max-time",
        process.env.VERCEL ? "50" : "300",
        "-X",
        "POST",
        `${BASE_URL}/chat/completions`,
        "-H",
        `Authorization: Bearer ${apiKey}`,
        "-H",
        "Content-Type: application/json",
        "-H",
        "Accept: text/event-stream",
        "--data-binary",
        `@${bodyPath}`,
      ];

      const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"] });
      let raw = "";
      let stderr = "";

      child.stdout.on("data", (buf: Buffer) => {
        raw += buf.toString("utf8");
      });
      child.stderr.on("data", (buf: Buffer) => {
        stderr += buf.toString("utf8");
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && !raw.includes("data:")) {
          reject(new Error(`NVIDIA curl failed (code ${code}): ${stderr.slice(0, 200) || "no output"}`));
          return;
        }

        let text = "";
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const json = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
              error?: { message?: string };
            };
            if (json.error?.message) {
              reject(new Error(`NVIDIA API: ${json.error.message}`));
              return;
            }
            text += json.choices?.[0]?.delta?.content || "";
          } catch {
            // ignore partial SSE lines
          }
        }

        resolve(text);
      });
    });

    if (!content.trim()) {
      throw new Error("NVIDIA API không trả về nội dung (curl stream)");
    }
    return content;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function chatViaOpenAISdk(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const openai = getClient();
  const stream = await openai.chat.completions.create({
    model: MODEL,
    messages: messages as ChatCompletionMessageParam[],
    temperature: options?.temperature ?? 1,
    top_p: 1,
    max_tokens: options?.maxTokens ?? 16384,
    seed: 42,
    stream: true as const,
  });

  let content = "";
  for await (const chunk of stream) {
    content += chunk.choices[0]?.delta?.content || "";
  }

  if (!content.trim()) {
    throw new Error("NVIDIA API không trả về nội dung");
  }
  return content;
}

/**
 * NVIDIA NIM — mẫu build.nvidia.com (stream: true).
 * Dev local: ưu tiên curl stream vì Node SDK hay timeout trên một số mạng VN.
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  if (process.env.NODE_ENV === "development" || process.env.NVIDIA_USE_CURL === "1") {
    return chatViaCurlStream(messages, options);
  }

  try {
    return await chatViaOpenAISdk(messages, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Trên Vercel không fallback curl (dễ vượt 60s → 504 + bài kẹt RUNNING)
    if (!process.env.VERCEL && /timed? ?out|fetch failed|ECONNRESET/i.test(message)) {
      return chatViaCurlStream(messages, options);
    }
    throw error;
  }
}

/** Ping Settings health — xác nhận key + model còn trong catalog (nhanh, ổn định) */
export async function pingNvidia(): Promise<{ ok: boolean; detail: string; ms: number }> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    return { ok: false, detail: "NVIDIA_API_KEY chưa set", ms: 0 };
  }

  const started = Date.now();
  try {
    const modelsRes = await fetch(`${BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(12_000),
    });
    const ms = Date.now() - started;
    if (!modelsRes.ok) {
      const raw = await modelsRes.text();
      return {
        ok: false,
        detail: `HTTP ${modelsRes.status}: ${raw.slice(0, 100) || modelsRes.statusText}`,
        ms,
      };
    }

    const modelsJson = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
    const ids = (modelsJson.data ?? []).map((m) => m.id).filter(Boolean) as string[];
    if (!ids.includes(MODEL)) {
      return {
        ok: false,
        detail: `Key OK nhưng model “${MODEL}” không có trong catalog (${ids.length} models)`,
        ms,
      };
    }

    return {
      ok: true,
      detail: `Key OK · ${MODEL}`,
      ms,
    };
  } catch (error) {
    const ms = Date.now() - started;
    const aborted =
      error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
    return {
      ok: false,
      detail: aborted
        ? "Timeout /models 12s — không tới được NVIDIA API"
        : error instanceof Error
          ? error.message.slice(0, 120)
          : "Lỗi NVIDIA",
      ms,
    };
  }
}
