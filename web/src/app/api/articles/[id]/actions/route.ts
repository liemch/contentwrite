import { NextRequest, NextResponse } from "next/server";
import { assertCanAccessArticle } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  approveArticle,
  applyCorrection,
  confirmHumanReview,
  polishFromHumanEdits,
  publishArticle,
  requestCorrection,
  retractArticle,
  resetWorkflow,
  runWorkflowStep,
  saveEditorValidationFeedback,
  saveManualDraftRevision,
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
        | "save-manual-draft"
        | "save-validation-feedback"
        | "save-fact-verdicts"
        | "request-correction"
        | "apply-correction"
        | "retract";
      notes?: string;
      allowWithoutHero?: boolean;
      editorialScore?: number;
      checklist?: string[];
      reviewFindingsAck?: string[];
      goldBarOverride?: boolean;
      items?: HumanReviewItem[];
      factClaims?: Array<{
        id: string;
        humanDisposition: "fixed" | "accept" | "pending";
        note?: string;
      }>;
      correction?: string;
      meaningChanged?: boolean;
      draftMarkdown?: string;
      expectedVersion?: number;
      finalUsability?: number;
      manualEditEffort?: number;
      confusingStep?: string;
      errorHelpfulness?: number;
      reuseIntent?: number;
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
      case "save-manual-draft": {
        if (typeof body.expectedVersion !== "number") {
          return NextResponse.json(
            { error: "expectedVersion là bắt buộc" },
            { status: 400 },
          );
        }
        const next = await saveManualDraftRevision({
          articleId: id,
          draftMarkdown: body.draftMarkdown ?? "",
          actorId: user.userId,
          expectedVersion: body.expectedVersion,
        });
        return NextResponse.json({ article: next });
      }
      case "save-validation-feedback": {
        if (typeof body.expectedVersion !== "number") {
          return NextResponse.json(
            { error: "expectedVersion là bắt buộc" },
            { status: 400 },
          );
        }
        const next = await saveEditorValidationFeedback({
          articleId: id,
          actorId: user.userId,
          expectedVersion: body.expectedVersion,
          finalUsability: body.finalUsability ?? 0,
          manualEditEffort: body.manualEditEffort ?? 0,
          confusingStep: body.confusingStep ?? "",
          errorHelpfulness: body.errorHelpfulness ?? 0,
          reuseIntent: body.reuseIntent ?? 0,
          note: body.notes,
        });
        return NextResponse.json({ article: next });
      }
      case "approve": {
        const next = await approveArticle(id, user.userId, body.notes, {
          allowWithoutHero: Boolean(body.allowWithoutHero),
          editorialScore: body.editorialScore,
          checklist: body.checklist,
          reviewFindingsAck: body.reviewFindingsAck,
          goldBarOverride: Boolean(body.goldBarOverride),
        });
        return NextResponse.json({ article: next });
      }
      case "publish": {
        const next = await publishArticle(id);
        return NextResponse.json({ article: next });
      }
      case "request-correction": {
        const next = await requestCorrection(id, body.correction ?? "", user.userId);
        return NextResponse.json({ article: next });
      }
      case "apply-correction": {
        const next = await applyCorrection(
          id,
          body.correction ?? "",
          Boolean(body.meaningChanged),
          user.userId,
        );
        return NextResponse.json({ article: next });
      }
      case "retract": {
        const next = await retractArticle(id, body.correction ?? "", user.userId);
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
