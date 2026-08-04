import { NextResponse } from "next/server";
import { assertCanAccessArticle } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) return NextResponse.json({ error: "Not found" }, { status: 404 });
    assertCanAccessArticle(user, article);

    const [transitions, artifacts] = await Promise.all([
      prisma.workflowTransition.findMany({
        where: { articleId: id, workflowRunId: article.workflowRunId },
        orderBy: { createdAt: "asc" },
      }),
      prisma.workflowArtifact.findMany({
        where: { articleId: id, workflowRunId: article.workflowRunId },
        orderBy: [{ createdAt: "asc" }, { revision: "asc" }],
        select: {
          id: true,
          type: true,
          revision: true,
          sourceRevision: true,
          sourceArtifactType: true,
          state: true,
          schemaVersion: true,
          operatingPromptVersion: true,
          domainProfileVersion: true,
          metadata: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      workflowRunId: article.workflowRunId,
      state: article.workflowState,
      transitions,
      artifacts,
    });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

