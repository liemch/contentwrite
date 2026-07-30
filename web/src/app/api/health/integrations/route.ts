import { NextResponse } from "next/server";
import { chatCompletion } from "@/lib/nvidia";
import { pingTavily } from "@/lib/search";

/** Health public — tách timing để biết Tavily vs NVIDIA chậm chỗ nào */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string; ms?: number }> = {};

  const tavily = await pingTavily();
  checks.tavily = tavily.ok
    ? { ok: true, detail: `${tavily.count} kết quả`, ms: tavily.ms }
    : { ok: false, detail: tavily.error, ms: tavily.ms };

  if (!process.env.NVIDIA_API_KEY) {
    checks.nvidia = { ok: false, detail: "NVIDIA_API_KEY chưa set", ms: 0 };
  } else {
    const started = Date.now();
    try {
      const text = await chatCompletion(
        [{ role: "user", content: "Reply with exactly: OK" }],
        { maxTokens: 8 },
      );
      checks.nvidia = {
        ok: /ok/i.test(text),
        detail: text.slice(0, 40) || "(empty)",
        ms: Date.now() - started,
      };
    } catch (error) {
      checks.nvidia = {
        ok: false,
        detail: error instanceof Error ? error.message : "Lỗi không xác định",
        ms: Date.now() - started,
      };
    }
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}

export const maxDuration = 120;
