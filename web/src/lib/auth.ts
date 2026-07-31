import { compare, hash } from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { UserRole } from "@/generated/prisma/client";
import { COOKIE_NAME } from "@/lib/auth-cookie";
import { prisma } from "@/lib/db";

const BCRYPT_ROUNDS = 10;

export type SessionUser = {
  userId: string;
  email: string;
  role: UserRole;
  name: string | null;
};

function getSecret() {
  const secret = process.env.SESSION_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error("SESSION_SECRET or ADMIN_PASSWORD must be set");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function verifyPasswordHash(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function createSession(user: {
  id: string;
  email: string;
  role: UserRole;
  name?: string | null;
}) {
  const token = await new SignJWT({
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = typeof payload.sub === "string" ? payload.sub : null;
    const email = typeof payload.email === "string" ? payload.email : null;
    const role = payload.role === "ADMIN" || payload.role === "EDITOR" ? payload.role : null;
    if (!userId || !email || !role) return null;

    return {
      userId,
      email,
      role,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch {
    return null;
  }
}

/** Tương thích cũ — true nếu có session hợp lệ */
export async function verifySession(): Promise<boolean> {
  return Boolean(await getSession());
}

export async function requireUser(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) {
    throw new AuthError("Unauthorized", 401);
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || !user.active) {
    throw new AuthError("Tài khoản không còn hiệu lực", 401);
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== UserRole.ADMIN) {
    throw new AuthError("Chỉ admin mới được thực hiện", 403);
  }
  return user;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function authErrorResponse(error: unknown): Response | null {
  if (error instanceof AuthError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return null;
}

/** Seed/bootstrap: tạo admin từ env nếu chưa có user nào */
export async function ensureBootstrapAdmin(): Promise<void> {
  const count = await prisma.user.count();
  if (count > 0) return;

  const email = (process.env.ADMIN_EMAIL || "admin@local").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD bắt buộc để seed admin đầu tiên");
  }

  await prisma.user.create({
    data: {
      email,
      name: "Admin",
      passwordHash: await hashPassword(password),
      role: UserRole.ADMIN,
      dailyArticleLimit: 20,
      active: true,
    },
  });

  const admin = await prisma.user.findUniqueOrThrow({ where: { email } });
  await prisma.autoWriteConfig.upsert({
    where: { id: "default" },
    create: { id: "default", ownerUserId: admin.id },
    update: { ownerUserId: admin.id },
  });
}

export { COOKIE_NAME } from "@/lib/auth-cookie";
