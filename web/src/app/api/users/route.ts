import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/client";
import { authErrorResponse, hashPassword, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

function publicUser(u: {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  active: boolean;
  dailyArticleLimit: number;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    dailyArticleLimit: u.dailyArticleLimit,
    createdAt: u.createdAt.toISOString(),
  };
}

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: [{ role: "asc" }, { email: "asc" }],
    });
    return NextResponse.json({ users: users.map(publicUser) });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      email?: string;
      name?: string;
      password?: string;
      role?: string;
      dailyArticleLimit?: number;
    };

    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    if (!email || !password) {
      return NextResponse.json({ error: "Cần email và mật khẩu tạm" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Mật khẩu tối thiểu 8 ký tự" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email đã tồn tại" }, { status: 409 });
    }

    const role = body.role === "ADMIN" ? UserRole.ADMIN : UserRole.EDITOR;
    const dailyArticleLimit =
      typeof body.dailyArticleLimit === "number"
        ? Math.max(0, Math.min(100, Math.floor(body.dailyArticleLimit)))
        : role === UserRole.ADMIN
          ? 20
          : 3;

    const user = await prisma.user.create({
      data: {
        email,
        name: body.name?.trim() || null,
        passwordHash: await hashPassword(password),
        role,
        dailyArticleLimit,
        active: true,
      },
    });

    return NextResponse.json({ user: publicUser(user) }, { status: 201 });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
