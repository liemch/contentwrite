import { NextRequest, NextResponse } from "next/server";
import { assertCanAccessArticle } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  approveArticle,
  publishArticle,
  resetWorkflow,
  runWorkflowStep,
} from "@/lib/tfes/workflow";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    assertCanAccessArticle(user, article);

    const body = (await request.json()) as {
      action?: "run-step" | "reset" | "approve" | "publish";
      notes?: string;
      allowWithoutHero?: boolean;
      editorialScore?: number;
      checklist?: string[];
    };

    switch (body.action) {
      case "run-step": {
        const next = await runWorkflowStep(id);
        const timings =
          next && typeof next === "object" && "_timings" in next
            ? (next as { _timings?: unknown })._timings
            : undefined;
        if (timings && next && typeof next === "object") {
          delete (next as { _timings?: unknown })._timings;
        }
        return NextResponse.json({ article: next, timings });
      }
      case "reset": {
        const next = await resetWorkflow(id);
        return NextResponse.json({ article: next });
      }
      case "approve": {
        const next = await approveArticle(id, body.notes, {
          allowWithoutHero: Boolean(body.allowWithoutHero),
          editorialScore: body.editorialScore,
          checklist: body.checklist,
        });
        return NextResponse.json({ article: next });
      }
      case "publish": {
        const next = await publishArticle(id);
        return NextResponse.json({ article: next });
      }
      default:
        return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const maxDuration = 300;
