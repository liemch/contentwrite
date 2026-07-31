import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  ensureBootstrapAdmin,
  verifyPasswordHash,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    await ensureBootstrapAdmin();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Không seed được admin";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const body = (await request.json()) as { email?: string; password?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Nhập email và mật khẩu" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
  }

  const ok = await verifyPasswordHash(password, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
  }

  await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      dailyArticleLimit: user.dailyArticleLimit,
    },
  });
}
