import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { pingNvidia } from "@/lib/nvidia";
import { pingTavily } from "@/lib/search";

/** Admin-only — probes external APIs (consumes quota). */
export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
