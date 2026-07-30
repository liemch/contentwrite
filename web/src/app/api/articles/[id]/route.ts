import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const article = await prisma.article.findUnique({ where: { id } });

  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ article });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.knowledgeRecord.deleteMany({ where: { articleId: id } });
  await prisma.article.delete({ where: { id } });

  if (article.heroImageUrl?.startsWith("/generated/heroes/")) {
    try {
      await unlink(join(process.cwd(), "public", article.heroImageUrl.replace(/^\//, "")));
    } catch {
      // ignore missing file
    }
  }

  return NextResponse.json({ ok: true });
}
