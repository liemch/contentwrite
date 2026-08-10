import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { isAdmin } from "@/lib/access";
import {
  getDeskMetrics,
  getRelatedAngles,
  loadSeriesAntiOverlap,
} from "@/lib/tfes/editorial-memory";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser();
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get("domain") || "engineering";
    const topic = searchParams.get("topic");
    const seriesId = searchParams.get("seriesId");
    const metricsOnly = searchParams.get("metrics") === "1";

    if (metricsOnly) {
      const metrics = await getDeskMetrics(
        isAdmin(user) ? {} : { createdById: user.userId },
      );
      return NextResponse.json({ metrics });
    }

    const accessScope = isAdmin(user)
      ? ({ mode: "admin" } as const)
      : ({ mode: "owner", userId: user.userId } as const);

    const [angles, seriesAnti] = await Promise.all([
      getRelatedAngles({
        domain,
        topic,
        seriesId,
        limit: 6,
        accessScope,
      }),
      seriesId
        ? loadSeriesAntiOverlap({ seriesId, accessScope })
        : Promise.resolve(null),
    ]);
    return NextResponse.json({
      angles,
      series: seriesAnti
        ? {
            title: seriesAnti.seriesTitle,
            description: seriesAnti.seriesDescription,
            siblings: seriesAnti.siblings,
          }
        : null,
    });
  } catch (error) {
    const authRes = authErrorResponse(error);
    if (authRes) return authRes;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
