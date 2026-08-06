let devFallbackWarned = false;

/**
 * JWT signing key. Production requires SESSION_SECRET (never ADMIN_PASSWORD).
 */
export function getSessionSecretBytes(): Uint8Array {
  const sessionSecret = process.env.SESSION_SECRET?.trim();
  if (sessionSecret) {
    return new TextEncoder().encode(sessionSecret);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }

  const fallback = process.env.ADMIN_PASSWORD?.trim();
  if (!fallback) {
    throw new Error("SESSION_SECRET or ADMIN_PASSWORD must be set");
  }

  if (!devFallbackWarned) {
    devFallbackWarned = true;
    console.warn(
      "[auth] SESSION_SECRET unset — using ADMIN_PASSWORD for JWT in development only.",
    );
  }

  return new TextEncoder().encode(fallback);
}
