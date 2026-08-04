import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import {
  listShapeProfiles,
  updateShapeProfile,
  type ShapeProfileView,
} from "@/lib/tfes/article-shape-manager";

export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ shapes: await listShapeProfiles() });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lỗi" }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = (await request.json()) as { shape?: ShapeProfileView };
    if (!body.shape) return NextResponse.json({ error: "Thiếu shape" }, { status: 400 });
    const shape = await updateShapeProfile(body.shape, admin.userId);
    return NextResponse.json({ shape });
  } catch (error) {
    const response = authErrorResponse(error);
    if (response) return response;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Lỗi" }, { status: 400 });
  }
}
