import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getSessionSecretBytes } from "@/lib/auth-secret";
import { isJwtMarkedInactive } from "@/lib/auth-session";
import { COOKIE_NAME } from "@/lib/auth-cookie";
import { isPublicPath } from "@/lib/public-routes";
import { safeInternalPath } from "@/lib/safe-redirect";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;
  let authed = false;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSessionSecretBytes());
      if (isJwtMarkedInactive(payload.active)) {
        authed = false;
      } else {
        authed = true;
      }
    } catch {
      authed = false;
    }
  }

  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", safeInternalPath(pathname, "/dashboard"));
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
