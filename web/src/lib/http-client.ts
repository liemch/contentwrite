import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const STATUS_SUFFIX = "\n__CURL_HTTP__:";

type PostJsonOptions = {
  url: string;
  headers?: Record<string, string>;
  body: unknown;
  timeoutMs?: number;
};

export type PostJsonResult = {
  ok: boolean;
  status: number;
  text: string;
};

function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer ***")
    .replace(/nvapi-[A-Za-z0-9_-]+/g, "nvapi-***")
    .replace(/tvly-[A-Za-z0-9_-]+/g, "tvly-***")
    .replace(/"api_key"\s*:\s*"[^"]+"/gi, '"api_key":"***"');
}

async function postJsonViaCurl(options: PostJsonOptions): Promise<PostJsonResult> {
  const payload = JSON.stringify(options.body);
  const headers = options.headers ?? {};
  const maxSeconds = Math.ceil((options.timeoutMs ?? 180000) / 1000);
  const dir = await mkdtemp(join(tmpdir(), "cth-http-"));
  const bodyPath = join(dir, "body.json");

  try {
    await writeFile(bodyPath, payload, "utf8");

    const args = [
      "-4",
      "-s",
      "-S",
      "-w",
      `${STATUS_SUFFIX}%{http_code}`,
      "-X",
      "POST",
      options.url,
      "-H",
      "Content-Type: application/json",
      "--connect-timeout",
      "25",
      "--max-time",
      String(maxSeconds),
      "--data-binary",
      `@${bodyPath}`,
    ];

    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === "content-type") continue;
      args.push("-H", `${key}: ${value}`);
    }

    const { stdout } = await execFileAsync("curl", args, {
      maxBuffer: 25 * 1024 * 1024,
    });

    const marker = stdout.lastIndexOf(STATUS_SUFFIX);
    const status =
      marker >= 0 ? Number(stdout.slice(marker + STATUS_SUFFIX.length).trim()) : 200;
    const text = marker >= 0 ? stdout.slice(0, marker) : stdout;

    if (!Number.isFinite(status) || status === 0) {
      throw new Error(`curl timeout/không kết nối được ${new URL(options.url).hostname}`);
    }

    return { ok: status >= 200 && status < 300, status, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(redactSecrets(message));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function postJson(options: PostJsonOptions): Promise<PostJsonResult> {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers ?? {}),
  };
  const payload = JSON.stringify(options.body);

  // Local: Node fetch hay timeout → dùng curl + body file
  if (process.env.NODE_ENV === "development") {
    return postJsonViaCurl(options);
  }

  try {
    const response = await fetch(options.url, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(options.timeoutMs ?? 120000),
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(redactSecrets(message));
  }
}

export { redactSecrets };
