import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import { pickFreshTopic } from "@/lib/auto-write/runner";
import { prisma } from "@/lib/db";

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

  const body = (await request.json()) as { topic?: string; domain?: string };
  const domain = body.domain === "soft-skills" ? "soft-skills" : "engineering";
  let topic = body.topic?.trim() || "";

  // Để trống → chọn thật từ seed_topics (không dùng câu hướng dẫn làm topic)
  if (!topic) {
    try {
      topic = await pickFreshTopic(domain);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không chọn được chủ đề";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const article = await prisma.article.create({
    data: {
      topic,
      domain,
    },
  });

  return NextResponse.json({ article }, { status: 201 });
}
