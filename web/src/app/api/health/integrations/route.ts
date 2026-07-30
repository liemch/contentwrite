import { NextResponse } from "next/server";
import { pingNvidia } from "@/lib/nvidia";
import { pingTavily } from "@/lib/search";

/** Health public — tách timing để biết Tavily vs NVIDIA chậm chỗ nào */
export async function GET() {
  const tavily = await pingTavily();
  const nvidia = await pingNvidia();

  const checks = {
    tavily: tavily.ok
      ? { ok: true, detail: `${tavily.count} kết quả`, ms: tavily.ms }
      : { ok: false, detail: tavily.error, ms: tavily.ms },
    nvidia,
  };

  const allOk = checks.tavily.ok && checks.nvidia.ok;
  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 503 });
}

export const maxDuration = 60;
