import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { chatCompletion } from "@/lib/nvidia";
import { pingTavily } from "@/lib/search";

/**
 * Kiểm tra nhanh Tavily (+ optional NVIDIA).
 * Auth bắt buộc trên UI; vẫn public path cũ giữ cho health tổng.
 */
export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tavily = await pingTavily();

  let nvidia: { ok: boolean; detail: string; ms: number } | null = null;
  if (process.env.NVIDIA_API_KEY) {
    const started = Date.now();
    try {
      const text = await chatCompletion(
        [{ role: "user", content: "Reply with exactly: OK" }],
        { maxTokens: 8 },
      );
      nvidia = {
        ok: /ok/i.test(text),
        detail: text.slice(0, 40) || "(empty)",
        ms: Date.now() - started,
      };
    } catch (error) {
      nvidia = {
        ok: false,
        detail: error instanceof Error ? error.message : "Lỗi NVIDIA",
        ms: Date.now() - started,
      };
    }
  } else {
    nvidia = { ok: false, detail: "NVIDIA_API_KEY chưa set", ms: 0 };
  }

  const ok = tavily.ok && Boolean(nvidia?.ok);
  return NextResponse.json(
    {
      ok,
      tavily: tavily.ok
        ? { ok: true, detail: `${tavily.count} kết quả`, ms: tavily.ms }
        : { ok: false, detail: tavily.error, ms: tavily.ms },
      nvidia,
    },
    { status: ok ? 200 : 503 },
  );
}

export const maxDuration = 90;
