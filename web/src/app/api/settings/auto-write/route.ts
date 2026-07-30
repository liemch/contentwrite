import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth";
import {
  getAutoWriteConfig,
  serializeConfig,
  updateAutoWriteConfig,
  type UpdateAutoWriteInput,
} from "@/lib/auto-write/runner";

export async function GET() {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await getAutoWriteConfig();
  return NextResponse.json({ config: serializeConfig(config) });
}

export async function PUT(request: NextRequest) {
  if (!(await verifySession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as UpdateAutoWriteInput;
  const config = await updateAutoWriteConfig(body);
  return NextResponse.json({ config: serializeConfig(config) });
}
