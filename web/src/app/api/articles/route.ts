import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { pickFreshTopic, getAutoWriteConfig } from "@/lib/auto-write/runner";
import { prisma } from "@/lib/db";
import {
  DEFAULT_AVOID_FORMATS,
  DEFAULT_TARGET_WORD_COUNT,
  parseAvoidFormats,
  resolveWritingPrefs,
  serializeAvoidFormats,
} from "@/lib/tfes/writing-prefs";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const articles = await prisma.article.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      topic: true,
      domain: true,
      status: true,
      currentStep: true,
      targetWordCount: true,
      avoidFormats: true,
      updatedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ articles });
}

export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    topic?: string;
    domain?: string;
    targetWordCount?: number;
    avoidFormats?: string;
  };
  const domain = body.domain === "soft-skills" ? "soft-skills" : "engineering";
  let topic = body.topic?.trim() || "";

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
    targetWordCount: body.targetWordCount,
    avoidFormats:
      body.avoidFormats !== undefined
        ? serializeAvoidFormats(parseAvoidFormats(body.avoidFormats))
        : undefined,
    defaultTargetWordCount: config.defaultTargetWordCount ?? DEFAULT_TARGET_WORD_COUNT,
    defaultAvoidFormats: config.defaultAvoidFormats ?? DEFAULT_AVOID_FORMATS,
  });

  const article = await prisma.article.create({
    data: {
      topic,
      domain,
      targetWordCount: prefs.targetWordCount,
      avoidFormats: serializeAvoidFormats(prefs.avoidFormats) || DEFAULT_AVOID_FORMATS,
    },
  });

  return NextResponse.json({ article }, { status: 201 });
}
