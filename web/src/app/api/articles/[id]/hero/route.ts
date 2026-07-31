import { NextRequest, NextResponse } from "next/server";
import { assertCanAccessArticle } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  generateHeroImage,
  injectHeroIntoCleanPublish,
  type HeroImageModel,
} from "@/lib/image/hero";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json()) as {
      model?: string;
      prompt?: string;
      alt?: string;
    };
    const model = body.model === "qwen" ? "qwen" : body.model === "flux" ? "flux" : null;

    if (!model) {
      return NextResponse.json({ error: "model phải là flux hoặc qwen" }, { status: 400 });
    }

    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    assertCanAccessArticle(user, article);

    if (!article.heroBrief && !article.cleanPublish && !article.topic && !body.prompt?.trim()) {
      return NextResponse.json(
        { error: "Chưa có Hero Brief / chủ đề / prompt để gen ảnh. Chạy Finalize hoặc nhập prompt." },
        { status: 400 },
      );
    }

    const result = await generateHeroImage({
      articleId: id,
      model: model as HeroImageModel,
      heroBrief: article.heroBrief,
      topic: article.topic,
      title: article.title,
      promptOverride: body.prompt?.trim() || null,
      altOverride: body.alt?.trim() || null,
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
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi gen ảnh";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const maxDuration = 120;
