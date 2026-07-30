import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  generateHeroImage,
  injectHeroIntoCleanPublish,
  type HeroImageModel,
} from "@/lib/image/hero";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as { model?: string };
  const model = body.model === "qwen" ? "qwen" : body.model === "flux" ? "flux" : null;

  if (!model) {
    return NextResponse.json({ error: "model phải là flux hoặc qwen" }, { status: 400 });
  }

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!article.heroBrief && !article.cleanPublish && !article.topic) {
    return NextResponse.json(
      { error: "Chưa có Hero Brief / chủ đề để gen ảnh. Chạy Finalize trước." },
      { status: 400 },
    );
  }

  try {
    const result = await generateHeroImage({
      articleId: id,
      model: model as HeroImageModel,
      heroBrief: article.heroBrief,
      topic: article.topic,
      title: article.title,
    });

    const cleanPublish = injectHeroIntoCleanPublish(
      article.cleanPublish,
      result.url,
      result.alt,
    );

    const updated = await prisma.article.update({
      where: { id },
      data: {
        heroImageUrl: result.url,
        heroImageModel: result.modelLabel,
        heroImageAlt: result.alt,
        heroPromptUsed: result.prompt,
        cleanPublish: cleanPublish ?? article.cleanPublish,
      },
    });

    return NextResponse.json({ article: updated, hero: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi gen ảnh";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const maxDuration = 180;
