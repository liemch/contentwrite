import { NextRequest, NextResponse } from "next/server";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { assertCanAccessArticle } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveCleanPublishEdit } from "@/lib/tfes/workflow";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const article = await prisma.article.findUnique({ where: { id } });

    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    assertCanAccessArticle(user, article);

    return NextResponse.json({ article });
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
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    assertCanAccessArticle(user, article);

    const body = (await request.json()) as {
      cleanPublish?: string;
      editNote?: string;
    };

    if (typeof body.cleanPublish === "string") {
      const next = await saveCleanPublishEdit(id, body.cleanPublish, body.editNote);
      return NextResponse.json({ article: next });
    }

    return NextResponse.json({ error: "Không có field để cập nhật" }, { status: 400 });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    assertCanAccessArticle(user, article);

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
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
