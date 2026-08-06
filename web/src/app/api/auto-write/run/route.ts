import { NextResponse } from "next/server";
import {
  previewSideEffectBlockedResponse,
  shouldBlockPreviewSideEffects,
} from "@/lib/deployment-env";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { tickAutoWrite } from "@/lib/auto-write/runner";

/**
 * Chạy/advance 1 bước auto (Hobby timeout).
 * UI “Chạy ngay” nên gọi lặp đến PUBLISH_READY.
 */
export async function POST() {
  if (shouldBlockPreviewSideEffects()) {
    return previewSideEffectBlockedResponse("auto-write/run");
  }
  try {
    await requireAdmin();
    const result = await tickAutoWrite({ force: true });
    return NextResponse.json(result);
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi auto-write";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 300;
