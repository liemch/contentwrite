import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { suggestTrendSeedTopics, type SeedDomain } from "@/lib/auto-write/suggest-seeds";

export async function POST(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    domain?: string;
    existingSeeds?: string;
  };

  const domain: SeedDomain =
    body.domain === "soft-skills" ? "soft-skills" : "engineering";

  try {
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
    const message = error instanceof Error ? error.message : "Lỗi gợi ý seed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const maxDuration = 120;
