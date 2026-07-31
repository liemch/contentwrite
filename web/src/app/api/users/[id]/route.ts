import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/generated/prisma/client";
import { authErrorResponse, hashPassword, requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

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

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      role?: string;
      active?: boolean;
      dailyArticleLimit?: number;
      password?: string;
    };

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Không tự hạ / tắt chính mình nếu là admin duy nhất
    if (id === admin.userId && body.active === false) {
      return NextResponse.json({ error: "Không thể tự vô hiệu hoá tài khoản đang dùng" }, { status: 400 });
    }
    if (id === admin.userId && body.role === "EDITOR") {
      const adminCount = await prisma.user.count({
        where: { role: UserRole.ADMIN, active: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Cần ít nhất một admin active" }, { status: 400 });
      }
    }

    const data: {
      name?: string | null;
      role?: UserRole;
      active?: boolean;
      dailyArticleLimit?: number;
      passwordHash?: string;
    } = {};

    if (body.name !== undefined) data.name = body.name.trim() || null;
    if (body.role === "ADMIN" || body.role === "EDITOR") data.role = body.role;
    if (typeof body.active === "boolean") data.active = body.active;
    if (typeof body.dailyArticleLimit === "number") {
      data.dailyArticleLimit = Math.max(0, Math.min(100, Math.floor(body.dailyArticleLimit)));
    }
    let temporaryPassword: string | undefined;
    if (body.password !== undefined && body.password.length > 0) {
      if (body.password.length < 8) {
        return NextResponse.json({ error: "Mật khẩu tối thiểu 8 ký tự" }, { status: 400 });
      }
      data.passwordHash = await hashPassword(body.password);
      temporaryPassword = body.password;
    }

    const updated = await prisma.user.update({ where: { id }, data });
    return NextResponse.json({
      user: publicUser(updated),
      ...(temporaryPassword ? { temporaryPassword } : {}),
    });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

/** Soft-delete: active = false */
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const admin = await requireAdmin();
    const { id } = await params;
    if (id === admin.userId) {
      return NextResponse.json({ error: "Không thể tự vô hiệu hoá" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (user.role === UserRole.ADMIN) {
      const adminCount = await prisma.user.count({
        where: { role: UserRole.ADMIN, active: true },
      });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Cần ít nhất một admin active" }, { status: 400 });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ user: publicUser(updated) });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
