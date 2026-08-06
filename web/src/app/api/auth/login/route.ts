import { NextRequest, NextResponse } from "next/server";
import {
  clearLoginAttempts,
  checkLoginRateLimit,
  loginRateLimitKey,
  recordLoginFailure,
} from "@/lib/login-rate-limit";
import {
  createSession,
  ensureBootstrapAdmin,
  verifyPasswordHash,
} from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: NextRequest) {
  const rateKey = loginRateLimitKey(request);
  const rate = checkLoginRateLimit(rateKey);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Quá nhiều lần đăng nhập. Thử lại sau ${rate.retryAfterSec ?? 60} giây.`,
      },
      { status: 429 },
    );
  }

  try {
    await ensureBootstrapAdmin();
  } catch {
    return NextResponse.json({ error: "Không thể khởi tạo hệ thống" }, { status: 500 });
  }

  const body = (await request.json()) as { email?: string; password?: string };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) {
    return NextResponse.json({ error: "Nhập email và mật khẩu" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    recordLoginFailure(rateKey);
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
  }

  const ok = await verifyPasswordHash(password, user.passwordHash);
  if (!ok) {
    recordLoginFailure(rateKey);
    return NextResponse.json({ error: "Email hoặc mật khẩu không đúng" }, { status: 401 });
  }

  clearLoginAttempts(rateKey);

  await createSession({
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    updatedAt: user.updatedAt,
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
