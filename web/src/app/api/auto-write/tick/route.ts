import { NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { tickAutoWrite } from "@/lib/auto-write/runner";

/** Tick lịch khi admin mở app (không force) */
export async function POST() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await tickAutoWrite({ force: false });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi tick auto-write";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const maxDuration = 300;
