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
      seriesId?: string | null;
      seriesOrder?: number | null;
      publishFormat?: string;
    };

    if (typeof body.cleanPublish === "string") {
      const next = await saveCleanPublishEdit(id, body.cleanPublish, body.editNote);
      return NextResponse.json({ article: next });
    }

    const data: {
      seriesId?: string | null;
      seriesOrder?: number | null;
      publishFormat?: string;
    } = {};

    if (body.seriesId !== undefined) {
      if (body.seriesId === null || body.seriesId === "") {
        data.seriesId = null;
        data.seriesOrder = null;
      } else {
        const series = await prisma.series.findUnique({ where: { id: body.seriesId } });
        if (!series) {
          return NextResponse.json({ error: "Series không tồn tại" }, { status: 400 });
        }
        data.seriesId = series.id;
        if (typeof body.seriesOrder === "number" && body.seriesOrder > 0) {
          data.seriesOrder = Math.floor(body.seriesOrder);
        } else if (article.seriesId !== series.id) {
          const max = await prisma.article.aggregate({
            where: { seriesId: series.id },
            _max: { seriesOrder: true },
          });
          data.seriesOrder = (max._max.seriesOrder ?? 0) + 1;
        }
      }
    } else if (typeof body.seriesOrder === "number" && body.seriesOrder > 0) {
      data.seriesOrder = Math.floor(body.seriesOrder);
    }

    if (typeof body.publishFormat === "string") {
      const { isPublishFormatId, resolvePublishFormat } = await import(
        "@/lib/tfes/publish-formats"
      );
      if (!isPublishFormatId(body.publishFormat)) {
        return NextResponse.json({ error: "Format không hợp lệ" }, { status: 400 });
      }
      // Chỉ đổi format khi chưa có bản sạch / còn sớm
      if (article.cleanPublish && article.cleanPublish.length > 80) {
        return NextResponse.json(
          { error: "Không đổi format sau khi đã có bản sạch — tạo bài mới." },
          { status: 400 },
        );
      }
      data.publishFormat = resolvePublishFormat(body.publishFormat).id;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Không có field để cập nhật" }, { status: 400 });
    }

    const next = await prisma.article.update({ where: { id }, data });
    return NextResponse.json({ article: next });
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
