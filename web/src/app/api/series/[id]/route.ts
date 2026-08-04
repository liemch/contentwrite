import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const series = await prisma.series.findUnique({
      where: { id },
      include: {
        articles: {
          orderBy: [{ seriesOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            topic: true,
            status: true,
            workflowState: true,
            domain: true,
            publishFormat: true,
            seriesOrder: true,
            publishedAt: true,
            updatedAt: true,
            cleanPublish: true,
          },
        },
      },
    });
    if (!series) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ series });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
    };
    const existing = await prisma.series.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const series = await prisma.series.update({
      where: { id },
      data: {
        ...(body.title?.trim() ? { title: body.title.trim() } : {}),
        ...(body.description !== undefined
          ? { description: body.description?.trim() || null }
          : {}),
      },
    });
    return NextResponse.json({ series });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    await requireUser();
    const { id } = await params;
    await prisma.article.updateMany({
      where: { seriesId: id },
      data: { seriesId: null, seriesOrder: null },
    });
    await prisma.series.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
