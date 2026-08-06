import { afterEach, describe, expect, it } from "vitest";
import {
  assertPreviewSideEffectsAllowed,
  getDeploymentTier,
  isPreviewDeployment,
  previewSideEffectBlockedResponse,
  shouldBlockPreviewSideEffects,
} from "./deployment-env";

const ENV_KEYS = ["VERCEL_ENV", "ALLOW_PREVIEW_SIDE_EFFECTS"] as const;

function saveEnv(): Record<string, string | undefined> {
  return Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of ENV_KEYS) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("deployment-env", () => {
  const snapshot = saveEnv();

  afterEach(() => {
    restoreEnv(snapshot);
  });

  it("detects preview tier", () => {
    process.env.VERCEL_ENV = "preview";
    expect(getDeploymentTier()).toBe("preview");
    expect(isPreviewDeployment()).toBe(true);
    expect(shouldBlockPreviewSideEffects()).toBe(true);
  });

  it("allows override on preview when flag set", () => {
    process.env.VERCEL_ENV = "preview";
    process.env.ALLOW_PREVIEW_SIDE_EFFECTS = "1";
    expect(shouldBlockPreviewSideEffects()).toBe(false);
    expect(() => assertPreviewSideEffectsAllowed("test")).not.toThrow();
  });

  it("does not block local or production", () => {
    delete process.env.VERCEL_ENV;
    expect(shouldBlockPreviewSideEffects()).toBe(false);

    process.env.VERCEL_ENV = "production";
    expect(shouldBlockPreviewSideEffects()).toBe(false);
  });

  it("returns 403 response helper", async () => {
    const res = previewSideEffectBlockedResponse("cron/auto-write");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { code: string };
    expect(body.code).toBe("PREVIEW_SIDE_EFFECT_BLOCKED");
  });
});
