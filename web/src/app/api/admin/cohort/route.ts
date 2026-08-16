import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import {
  computeCohortStats,
  loadCohortManifest,
  saveCohortManifest,
} from "@/lib/cohort-tracker";
import { reportServerError } from "@/lib/observability";

export async function GET() {
  try {
    const user = await requireUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const manifest = await loadCohortManifest();
    const stats = await computeCohortStats(manifest);
    return NextResponse.json({ stats });
  } catch (error) {
    reportServerError(error, { route: "GET /api/admin/cohort" });
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireUser();
    if (!isAdmin(user)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await request.json()) as {
      cohortId?: string;
      articleIds?: string[];
      notes?: string;
    };
    const manifest = await loadCohortManifest();
    const next = await saveCohortManifest(
      {
        ...manifest,
        cohortId: body.cohortId?.trim() || manifest.cohortId,
        articleIds: Array.isArray(body.articleIds) ? body.articleIds : manifest.articleIds,
        notes: body.notes ?? manifest.notes,
      },
      user.email,
    );
    const stats = await computeCohortStats(next);
    return NextResponse.json({ stats });
  } catch (error) {
    reportServerError(error, { route: "PUT /api/admin/cohort" });
    const res = authErrorResponse(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
