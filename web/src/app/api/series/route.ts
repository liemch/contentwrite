import { NextRequest, NextResponse } from "next/server";
import { authErrorResponse, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listSeries, uniqueSeriesSlug } from "@/lib/tfes/series";
import { resolveDomainId } from "@/lib/tfes/domains";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const domain = new URL(request.url).searchParams.get("domain");
    const series = await listSeries(domain);
    return NextResponse.json({ series });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      domain?: string;
    };
    const title = body.title?.trim();
    if (!title) {
      return NextResponse.json({ error: "Cần tiêu đề series" }, { status: 400 });
    }
    const domain = resolveDomainId(body.domain);
    const slug = await uniqueSeriesSlug(title);
    const series = await prisma.series.create({
      data: {
        title,
        slug,
        description: body.description?.trim() || null,
        domain,
      },
    });
    return NextResponse.json({ series }, { status: 201 });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    const message = error instanceof Error ? error.message : "Lỗi";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
