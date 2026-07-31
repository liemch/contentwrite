import { NextResponse } from "next/server";
import { getQuotaInfo } from "@/lib/access";
import { AuthError, authErrorResponse, requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const quota = await getQuotaInfo(user);
    return NextResponse.json({
      user: {
        id: user.userId,
        email: user.email,
        role: user.role,
        name: user.name,
      },
      quota,
    });
  } catch (error) {
    const res = authErrorResponse(error);
    if (res) return res;
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
