import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import {
  approveArticle,
  publishArticle,
  resetWorkflow,
  runWorkflowStep,
} from "@/lib/tfes/workflow";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json()) as {
    action?: "run-step" | "reset" | "approve" | "publish";
    notes?: string;
  };

  try {
    switch (body.action) {
      case "run-step": {
        const article = await runWorkflowStep(id);
        const timings =
          article && typeof article === "object" && "_timings" in article
            ? (article as { _timings?: unknown })._timings
            : undefined;
        if (timings && article && typeof article === "object") {
          delete (article as { _timings?: unknown })._timings;
        }
        return NextResponse.json({ article, timings });
      }
      case "reset": {
        const article = await resetWorkflow(id);
        return NextResponse.json({ article });
      }
      case "approve": {
        const article = await approveArticle(id, body.notes);
        return NextResponse.json({ article });
      }
      case "publish": {
        const article = await publishArticle(id);
        return NextResponse.json({ article });
      }
      default:
        return NextResponse.json({ error: "action không hợp lệ" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export const maxDuration = 300;
