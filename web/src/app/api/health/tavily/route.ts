import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { chatCompletion } from "@/lib/nvidia";
import { pingTavily } from "@/lib/search";

/**
 * Mặc định chỉ ping Tavily (nhanh).
 * Thêm ?nvidia=1 để test NVIDIA (có thể 10–40s).
 */
export async function GET(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wantNvidia = request.nextUrl.searchParams.get("nvidia") === "1";

  const tavily = await pingTavily();
  const result: {
    ok: boolean;
    tavily: { ok: boolean; detail: string; ms: number };
    nvidia?: { ok: boolean; detail: string; ms: number };
  } = {
    ok: tavily.ok,
    tavily: tavily.ok
      ? { ok: true, detail: `${tavily.count} kết quả`, ms: tavily.ms }
      : { ok: false, detail: tavily.error, ms: tavily.ms },
  };

  if (wantNvidia) {
    if (!process.env.NVIDIA_API_KEY) {
      result.nvidia = { ok: false, detail: "NVIDIA_API_KEY chưa set", ms: 0 };
      result.ok = false;
    } else {
      const started = Date.now();
      try {
        const text = await Promise.race([
          chatCompletion([{ role: "user", content: "Reply with exactly: OK" }], {
            maxTokens: 8,
          }),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error("NVIDIA timeout sau 25s")), 25000),
          ),
        ]);
        result.nvidia = {
          ok: /ok/i.test(text),
          detail: text.slice(0, 40) || "(empty)",
          ms: Date.now() - started,
        };
        result.ok = result.ok && result.nvidia.ok;
      } catch (error) {
        result.nvidia = {
          ok: false,
          detail: error instanceof Error ? error.message : "Lỗi NVIDIA",
          ms: Date.now() - started,
        };
        result.ok = false;
      }
    }
  }

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
  });
}

export const maxDuration = 60;
