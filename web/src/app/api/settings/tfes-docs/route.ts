import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import {
  getTfesDocument,
  listTfesDocuments,
  resetTfesDocument,
  saveTfesDocument,
} from "@/lib/tfes/tfes-docs";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const path = request.nextUrl.searchParams.get("path");
    if (path) {
      const doc = await getTfesDocument(path);
      return NextResponse.json({ document: doc });
    }
    const documents = await listTfesDocuments();
    return NextResponse.json({ documents });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi đọc tài liệu";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAdmin();
    const body = (await request.json()) as {
      path?: string;
      content?: string;
      reset?: boolean;
    };

    if (!body.path?.trim()) {
      return NextResponse.json({ error: "Thiếu path" }, { status: 400 });
    }

    if (body.reset) {
      const document = await resetTfesDocument(body.path.trim());
      return NextResponse.json({ document, reset: true });
    }

    if (typeof body.content !== "string") {
      return NextResponse.json({ error: "Thiếu content" }, { status: 400 });
    }

    const saved = await saveTfesDocument({
      path: body.path.trim(),
      content: body.content,
      updatedBy: user.email,
    });
    const document = await getTfesDocument(saved.path);
    return NextResponse.json({ document });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi lưu tài liệu";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
