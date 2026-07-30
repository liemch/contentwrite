import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { tickAutoWrite } from "@/lib/auto-write/runner";

/**
 * Chạy/advance 1 bước auto (Hobby timeout).
 * UI “Chạy ngay” nên gọi lặp đến PUBLISH_READY.
 */
export async function POST() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await tickAutoWrite({ force: true });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi auto-write";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 300;
