import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { tickAutoWrite } from "@/lib/auto-write/runner";

/** Tick lịch khi admin mở app (không force) */
export async function POST() {
  try {
    await requireAdmin();
    const result = await tickAutoWrite({ force: false });
    return NextResponse.json(result);
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi tick auto-write";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 300;
