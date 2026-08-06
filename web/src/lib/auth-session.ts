/** Pure session invalidation rules (testable without DB). */
export function isSessionInvalidated(
  dbUser: { active: boolean; updatedAt: Date },
  jwtSessionVersion?: number,
): boolean {
  if (!dbUser.active) return true;
  if (
    jwtSessionVersion != null &&
    dbUser.updatedAt.getTime() > jwtSessionVersion
  ) {
    return true;
  }
  return false;
}

/** Middleware may reject JWTs explicitly marked inactive (no DB). */
export function isJwtMarkedInactive(activeClaim: unknown): boolean {
  return activeClaim === false;
}
