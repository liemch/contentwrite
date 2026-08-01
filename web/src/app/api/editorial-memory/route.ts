import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import { getDeskMetrics, getRelatedAngles } from "@/lib/tfes/editorial-memory";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain") || "engineering";
    const topic = searchParams.get("topic");
    const metricsOnly = searchParams.get("metrics") === "1";

    if (metricsOnly) {
      const metrics = await getDeskMetrics(
        isAdmin(user) ? {} : { createdById: user.userId },
      );
      return NextResponse.json({ metrics });
    }

    const angles = await getRelatedAngles({
      domain,
      topic,
      limit: 6,
    });
    return NextResponse.json({ angles });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
