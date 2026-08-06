import { NextRequest, NextResponse } from "next/server";
import { canAccessDigest } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const digest = await prisma.digest.findUnique({ where: { id } });
    if (!digest || !canAccessDigest(user, digest)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ digest });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json()) as {
      status?: "DRAFT" | "PUBLISHED";
      body?: string;
      title?: string;
    };
    const existing = await prisma.digest.findUnique({ where: { id } });
    if (!existing || !canAccessDigest(user, existing)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextStatus = body.status ?? existing.status;
    const digest = await prisma.digest.update({
      where: { id },
      data: {
        ...(body.title?.trim() ? { title: body.title.trim() } : {}),
        ...(typeof body.body === "string" ? { body: body.body } : {}),
        status: nextStatus,
        publishedAt:
          nextStatus === "PUBLISHED"
            ? existing.publishedAt ?? new Date()
            : existing.publishedAt,
      },
    });
    return NextResponse.json({ digest });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const existing = await prisma.digest.findUnique({ where: { id } });
    if (!existing || !canAccessDigest(user, existing)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.digest.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
