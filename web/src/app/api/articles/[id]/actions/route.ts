import { NextRequest, NextResponse } from "next/server";
import { assertCanAccessArticle } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  approveArticle,
  confirmHumanReview,
  polishFromHumanEdits,
  publishArticle,
  resetWorkflow,
  runWorkflowStep,
  saveFactHumanVerdicts,
} from "@/lib/tfes/workflow";
import type { HumanReviewItem } from "@/lib/tfes/human-review";

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
      action?:
        | "run-step"
        | "reset"
        | "approve"
        | "publish"
        | "confirm-human-review"
        | "polish-human-edits"
        | "save-fact-verdicts";
      notes?: string;
      allowWithoutHero?: boolean;
      editorialScore?: number;
      checklist?: string[];
      reviewFindingsAck?: string[];
      items?: HumanReviewItem[];
      factClaims?: Array<{
        id: string;
        humanDisposition: "fixed" | "accept" | "pending";
        note?: string;
      }>;
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
      case "confirm-human-review": {
        const next = await confirmHumanReview(id, {
          items: body.items ?? [],
          notes: body.notes,
        });
        return NextResponse.json({ article: next });
      }
      case "polish-human-edits": {
        const next = await polishFromHumanEdits(id, body.notes);
        return NextResponse.json({ article: next });
      }
      case "save-fact-verdicts": {
        const next = await saveFactHumanVerdicts(id, body.factClaims ?? []);
        return NextResponse.json({ article: next });
      }
      case "approve": {
        const next = await approveArticle(id, body.notes, {
          allowWithoutHero: Boolean(body.allowWithoutHero),
          editorialScore: body.editorialScore,
          checklist: body.checklist,
          reviewFindingsAck: body.reviewFindingsAck,
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
