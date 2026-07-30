import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { pingNvidia } from "@/lib/nvidia";
import { pingTavily } from "@/lib/search";

/**
 * Mặc định chỉ ping Tavily (nhanh).
 * Thêm ?nvidia=1 để test NVIDIA (non-stream, ≤20s).
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
    result.nvidia = await pingNvidia();
    result.ok = result.ok && result.nvidia.ok;
  }

  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
  });
}

export const maxDuration = 60;
