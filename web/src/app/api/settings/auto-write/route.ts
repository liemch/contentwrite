import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin, requireUser } from "@/lib/auth";
import {
  getAutoWriteConfig,
  serializeConfig,
  updateAutoWriteConfig,
  type UpdateAutoWriteInput,
} from "@/lib/auto-write/runner";

export async function GET() {
  try {
    // Editor cũng đọc defaults writing prefs khi tạo bài
    await requireUser();
    const config = await getAutoWriteConfig();
    return NextResponse.json({ config: serializeConfig(config) });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAdmin();
    const body = (await request.json()) as UpdateAutoWriteInput;
    const config = await updateAutoWriteConfig(body);
    return NextResponse.json({ config: serializeConfig(config) });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
