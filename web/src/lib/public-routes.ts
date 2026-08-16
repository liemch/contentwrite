/** Routes readable without login — trang tin công khai cho độc giả. */
export const PUBLIC_PATHS = ["/", "/login", "/api/auth/login", "/api/auth/me", "/api/cron/auto-write"] as const;

export function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.some((p) => pathname === p)) return true;
  if (pathname.startsWith("/bai/")) return true;
  return false;
}

export function publicArticleHref(id: string): string {
  return `/bai/${id}`;
}
