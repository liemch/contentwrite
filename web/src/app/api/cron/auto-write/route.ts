import { NextRequest, NextResponse } from "next/server";
import { tickAutoWrite } from "@/lib/auto-write/runner";

function authorizeCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Local/dev: cho phép nếu không set secret (chỉ khi NODE_ENV !== production)
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  // Vercel Cron cũng gửi header này khi cấu hình CRON_SECRET
  const vercel = request.headers.get("x-vercel-cron");
  if (vercel === "1" && auth === `Bearer ${secret}`) return true;
  return false;
}

/** Cron tick — chỉ chạy khi đến giờ & enabled */
export async function GET(request: NextRequest) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await tickAutoWrite({ force: false });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi cron auto-write";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

export const maxDuration = 300;
