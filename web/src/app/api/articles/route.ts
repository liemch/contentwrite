import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
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

  const article = await prisma.article.create({
    data: {
      topic: body.topic?.trim() || null,
      domain,
    },
  });

  return NextResponse.json({ article }, { status: 201 });
}
