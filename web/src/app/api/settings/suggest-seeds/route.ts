import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { resolveDomainId } from "@/lib/tfes/domains";
import { suggestTrendSeedTopics } from "@/lib/auto-write/suggest-seeds";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as {
      domain?: string;
      existingSeeds?: string;
    };

    const domain = resolveDomainId(body.domain);

    const result = await suggestTrendSeedTopics({
      domain,
      existingSeeds: body.existingSeeds,
    });
    return NextResponse.json({
      domain,
      topics: result.topics,
      count: result.topics.length,
      searchHits: result.searchHits,
      llmMs: result.llmMs,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi gợi ý seed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const maxDuration = 120;
