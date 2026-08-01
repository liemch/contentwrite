import { NextRequest, NextResponse } from "next/server";
import { assertCanAccessArticle } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildPublishPack } from "@/lib/publish-pack";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    assertCanAccessArticle(user, article);

    if (!(article.cleanPublish ?? "").trim()) {
      return NextResponse.json(
        { error: "Cần bản sạch trước khi sinh Gói đăng" },
        { status: 400 },
      );
    }

    const pack = await buildPublishPack({
      title: article.title,
      topic: article.topic,
      cleanPublish: article.cleanPublish!,
      domain: article.domain,
    });

    return NextResponse.json({ pack });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const maxDuration = 120;
