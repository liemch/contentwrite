import { NextRequest, NextResponse } from "next/server";
import { assertCanCreateArticle, editorialWhere, getQuotaInfo } from "@/lib/access";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";
import { pickFreshTopic, getAutoWriteConfig } from "@/lib/auto-write/runner";
import { prisma } from "@/lib/db";
import { resolveDomainId } from "@/lib/tfes/domains";
import { isPublishFormatId, resolvePublishFormat } from "@/lib/tfes/publish-formats";
import { hydrateTfesOverrides } from "@/lib/tfes/tfes-docs";
import {
  DEFAULT_AVOID_FORMATS,
  DEFAULT_TARGET_WORD_COUNT,
  normalizeAvoidFormatsText,
  resolveWritingPrefs,
} from "@/lib/tfes/writing-prefs";

export async function GET() {
  try {
    const user = await requireUser();
    const articles = await prisma.article.findMany({
      where: editorialWhere(user),
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        topic: true,
        domain: true,
        status: true,
        currentStep: true,
        publishFormat: true,
        seriesId: true,
        seriesOrder: true,
        targetWordCount: true,
        avoidFormats: true,
        createdById: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    const quota = await getQuotaInfo(user);
    return NextResponse.json({ articles, quota });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    await assertCanCreateArticle(user);

    const body = (await request.json()) as {
      topic?: string;
      domain?: string;
      targetWordCount?: number;
      avoidFormats?: string;
      publishFormat?: string;
      seriesId?: string | null;
      seriesOrder?: number | null;
    };
    const domain = resolveDomainId(body.domain);
    let topic = body.topic?.trim() || "";
    const publishFormat = resolvePublishFormat(
      isPublishFormatId(body.publishFormat) ? body.publishFormat : "blog",
    );

    await hydrateTfesOverrides();
    const config = await getAutoWriteConfig();

    if (!topic) {
      try {
        topic = await pickFreshTopic(domain, {
          useSeedTopics: config.useSeedTopics,
          customTopics: config.customTopics,
          seedTopicsEngineering: config.seedTopicsEngineering,
          seedTopicsSoftSkills: config.seedTopicsSoftSkills,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Không chọn được chủ đề";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const prefs = resolveWritingPrefs({
      targetWordCount:
        body.targetWordCount != null ? body.targetWordCount : publishFormat.wordHint,
      avoidFormats:
        body.avoidFormats !== undefined
          ? normalizeAvoidFormatsText(body.avoidFormats)
          : undefined,
      defaultTargetWordCount: config.defaultTargetWordCount ?? DEFAULT_TARGET_WORD_COUNT,
      defaultAvoidFormats: config.defaultAvoidFormats ?? DEFAULT_AVOID_FORMATS,
    });

    let seriesId: string | null = null;
    let seriesOrder: number | null = null;
    if (body.seriesId) {
      const series = await prisma.series.findUnique({ where: { id: body.seriesId } });
      if (!series) {
        return NextResponse.json({ error: "Series không tồn tại" }, { status: 400 });
      }
      seriesId = series.id;
      if (typeof body.seriesOrder === "number" && body.seriesOrder > 0) {
        seriesOrder = Math.floor(body.seriesOrder);
      } else {
        const max = await prisma.article.aggregate({
          where: { seriesId },
          _max: { seriesOrder: true },
        });
        seriesOrder = (max._max.seriesOrder ?? 0) + 1;
      }
    }

    const article = await prisma.article.create({
      data: {
        topic,
        domain,
        source: "manual",
        createdById: user.userId,
        publishFormat: publishFormat.id,
        targetWordCount: prefs.targetWordCount,
        avoidFormats: prefs.avoidFormatsText || DEFAULT_AVOID_FORMATS,
        seriesId,
        seriesOrder,
      },
    });

    const quota = await getQuotaInfo(user);
    return NextResponse.json({ article, quota }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError && error.status === 429) {
      try {
        const session = await requireUser();
        const quota = await getQuotaInfo(session);
        return NextResponse.json({ error: error.message, quota }, { status: 429 });
      } catch {
        return NextResponse.json({ error: error.message }, { status: 429 });
      }
    }
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
