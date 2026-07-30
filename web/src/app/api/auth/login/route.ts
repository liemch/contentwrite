import { NextRequest, NextResponse } from "next/server";
import { createSession, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { password?: string };
  const password = body.password ?? "";

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Mật khẩu không đúng" }, { status: 401 });
  }

  await createSession();
  return NextResponse.json({ ok: true });
}
