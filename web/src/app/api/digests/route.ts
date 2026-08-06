import { NextRequest, NextResponse } from "next/server";
import { ownedResourceWhere } from "@/lib/access";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateWeeklyDigest } from "@/lib/tfes/digest";
import { resolveDomainId } from "@/lib/tfes/domains";

export async function GET() {
  try {
    const user = await requireUser();
    const digests = await prisma.digest.findMany({
      where: ownedResourceWhere(user),
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return NextResponse.json({ digests });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await request.json().catch(() => ({}))) as {
      domain?: string | null;
      weekLabel?: string;
    };
    const domain =
      body.domain && body.domain !== "all"
        ? resolveDomainId(body.domain)
        : null;

    const { digest, sources } = await generateWeeklyDigest({
      createdById: user.userId,
      domain,
      weekLabel: body.weekLabel,
    });

    return NextResponse.json({ digest, sources }, { status: 201 });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
