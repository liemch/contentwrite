import { NextResponse } from "next/server";
import { authErrorResponse, requireAdmin } from "@/lib/auth";
import { getDeploymentVersion } from "@/lib/deployment-version";

/** Admin-only, read-only deployment identity. No secrets or arbitrary environment values. */
export async function GET() {
  try {
    await requireAdmin();
    return NextResponse.json({ version: getDeploymentVersion() });
  } catch (error) {
    const auth = authErrorResponse(error);
    if (auth) return auth;
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
