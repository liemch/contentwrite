/**
 * Vercel / local deployment tier helpers.
 * Preview defaults block paid side effects (AI, auto-write, cron work).
 */

export type DeploymentTier = "local" | "preview" | "production";

export function getDeploymentTier(): DeploymentTier {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === "production") return "production";
  if (vercelEnv === "preview") return "preview";
  return "local";
}

export function isPreviewDeployment(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/** Explicit override for controlled preview testing (never set on Production). */
export function previewSideEffectsAllowed(): boolean {
  return process.env.ALLOW_PREVIEW_SIDE_EFFECTS === "1";
}

/**
 * Block cron, auto-write, and paid AI on Vercel Preview by default.
 * Does not block read-only pages or auth.
 */
export function shouldBlockPreviewSideEffects(): boolean {
  return isPreviewDeployment() && !previewSideEffectsAllowed();
}

export class PreviewSideEffectBlockedError extends Error {
  readonly code = "PREVIEW_SIDE_EFFECT_BLOCKED";

  constructor(context: string) {
    super(
      `Side effects blocked on Vercel Preview (${context}). Use a separate preview database and set ALLOW_PREVIEW_SIDE_EFFECTS=1 only for controlled tests.`,
    );
    this.name = "PreviewSideEffectBlockedError";
  }
}

export function assertPreviewSideEffectsAllowed(context: string): void {
  if (shouldBlockPreviewSideEffects()) {
    throw new PreviewSideEffectBlockedError(context);
  }
}

export function previewSideEffectBlockedResponse(context: string): Response {
  return Response.json(
    {
      error: "Preview deployment: side effects disabled",
      code: "PREVIEW_SIDE_EFFECT_BLOCKED",
      context,
    },
    { status: 403 },
  );
}
