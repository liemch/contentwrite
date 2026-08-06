import { NextRequest, NextResponse } from "next/server";
import { assertCanAccessArticle } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  generateHeroImage,
  injectGalleryIntoCleanPublish,
  type HeroImageModel,
} from "@/lib/image/hero";
import {
  MAX_ARTICLE_IMAGES,
  resolveGallery,
  serializeGallery,
  type GalleryImage,
} from "@/lib/image/gallery";
import { suggestImageBriefs } from "@/lib/image/suggest-briefs";
import { hydrateTfesOverrides } from "@/lib/tfes/tfes-docs";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await request.json()) as {
      action?: "suggest" | "generate" | "remove" | "apply";
      model?: string;
      prompt?: string;
      alt?: string;
      conceptVi?: string;
      role?: "hero" | "inline";
      afterHeadingIndex?: number | null;
      imageId?: string;
      count?: number;
      slots?: Array<{
        role?: "hero" | "inline";
        promptEn?: string;
        altVi?: string;
        conceptVi?: string;
        afterHeadingIndex?: number | null;
      }>;
    };

    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    assertCanAccessArticle(user, article);

    const action = body.action || "generate";

    if (action === "suggest") {
      await hydrateTfesOverrides();
      const count = body.count ?? 3;
      const slots = await suggestImageBriefs({
        domain: article.domain,
        title: article.title,
        topic: article.topic,
        cleanPublish: article.cleanPublish,
        heroBrief: article.heroBrief,
        count,
      });
      return NextResponse.json({ slots });
    }

    if (action === "remove") {
      if (!body.imageId) {
        return NextResponse.json({ error: "Thiếu imageId" }, { status: 400 });
      }
      const gallery = resolveGallery(article).filter((g) => g.id !== body.imageId);
      const cleanPublish = injectGalleryIntoCleanPublish(article.cleanPublish, gallery);
      const hero = gallery.find((g) => g.role === "hero") || gallery[0] || null;
      const updated = await prisma.article.update({
        where: { id },
        data: {
          galleryJson: serializeGallery(gallery),
          cleanPublish: cleanPublish ?? article.cleanPublish,
          heroImageUrl: hero?.url ?? null,
          heroImageAlt: hero?.alt ?? null,
          heroImageModel: hero?.modelLabel ?? null,
          heroPromptUsed: hero?.prompt ?? null,
        },
      });
      return NextResponse.json({ article: updated, gallery });
    }

    if (action === "apply") {
      // Chỉ chèn lại gallery hiện có vào bản sạch
      const gallery = resolveGallery(article);
      const cleanPublish = injectGalleryIntoCleanPublish(article.cleanPublish, gallery);
      const updated = await prisma.article.update({
        where: { id },
        data: { cleanPublish: cleanPublish ?? article.cleanPublish },
      });
      return NextResponse.json({ article: updated, gallery });
    }

    // generate
    const model = body.model === "qwen" ? "qwen" : body.model === "flux" ? "flux" : null;
    if (!model) {
      return NextResponse.json({ error: "model phải là flux hoặc qwen" }, { status: 400 });
    }

    if (
      !article.heroBrief &&
      !article.cleanPublish &&
      !article.topic &&
      !body.prompt?.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Chưa có bản sạch / chủ đề / prompt. Chạy Finalize hoặc bấm «Gợi ý từ bài».",
        },
        { status: 400 },
      );
    }

    const role = body.role === "inline" ? "inline" : "hero";
    let gallery = resolveGallery(article);

    if (gallery.length >= MAX_ARTICLE_IMAGES && role === "inline") {
      const hasHero = gallery.some((g) => g.role === "hero");
      if (hasHero && gallery.length >= MAX_ARTICLE_IMAGES) {
        return NextResponse.json(
          { error: `Tối đa ${MAX_ARTICLE_IMAGES} ảnh / bài. Xoá bớt trước khi gen thêm.` },
          { status: 400 },
        );
      }
    }

    const result = await generateHeroImage({
      articleId: id,
      model: model as HeroImageModel,
      heroBrief: article.heroBrief,
      topic: article.topic,
      title: article.title,
      cleanPublish: article.cleanPublish,
      promptOverride: body.prompt?.trim() || null,
      altOverride: body.alt?.trim() || null,
      conceptVi: body.conceptVi?.trim() || null,
    });

    const newImage: GalleryImage = {
      id: `${role}-${Date.now().toString(36)}`,
      role,
      url: result.url,
      alt: result.alt,
      prompt: result.prompt,
      modelLabel: result.modelLabel,
      afterHeadingIndex:
        typeof body.afterHeadingIndex === "number" ? body.afterHeadingIndex : null,
      createdAt: new Date().toISOString(),
    };

    if (role === "hero") {
      gallery = [newImage, ...gallery.filter((g) => g.role !== "hero")].slice(
        0,
        MAX_ARTICLE_IMAGES,
      );
    } else {
      gallery = [...gallery, newImage].slice(0, MAX_ARTICLE_IMAGES);
    }

    const cleanPublish = injectGalleryIntoCleanPublish(article.cleanPublish, gallery);
    const hero = gallery.find((g) => g.role === "hero") || gallery[0];

    const updated = await prisma.article.update({
      where: { id },
      data: {
        galleryJson: serializeGallery(gallery),
        cleanPublish: cleanPublish ?? article.cleanPublish,
        heroImageUrl: hero?.url ?? result.url,
        heroImageModel: hero?.modelLabel ?? result.modelLabel,
        heroImageAlt: hero?.alt ?? result.alt,
        heroPromptUsed: hero?.prompt ?? result.prompt,
        // Cập nhật heroBrief nếu gen hero mới có concept
        ...(role === "hero" && body.conceptVi
          ? {
              heroBrief: `HERO IMAGE BRIEF\nConcept: ${body.conceptVi}\nPrompt (English): "${result.prompt}"\nAlt: ${result.alt}`,
            }
          : {}),
      },
    });

    return NextResponse.json({ article: updated, hero: result, gallery, image: newImage });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi gen ảnh";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const maxDuration = 180;
