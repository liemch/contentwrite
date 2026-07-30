import { NextResponse } from "next/server";
import { chatCompletion } from "@/lib/nvidia";
import { webSearch } from "@/lib/search";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  if (!process.env.TAVILY_API_KEY) {
    checks.tavily = { ok: false, detail: "TAVILY_API_KEY chưa set" };
  } else {
    try {
      const results = await webSearch("MCP model context protocol test");
      checks.tavily = { ok: true, detail: `${results.length} kết quả` };
    } catch (error) {
      checks.tavily = {
        ok: false,
        detail: error instanceof Error ? error.message : "Lỗi không xác định",
      };
    }
  }

  if (!process.env.NVIDIA_API_KEY) {
    checks.nvidia = { ok: false, detail: "NVIDIA_API_KEY chưa set" };
  } else {
    try {
      const text = await chatCompletion(
        [{ role: "user", content: "Trả lời đúng 1 từ: OK" }],
        { maxTokens: 10 },
      );
      checks.nvidia = { ok: true, detail: text.slice(0, 40) };
    } catch (error) {
      checks.nvidia = {
        ok: false,
        detail: error instanceof Error ? error.message : "Lỗi không xác định",
      };
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}

export const maxDuration = 120;
