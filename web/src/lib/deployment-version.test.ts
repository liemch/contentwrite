import { afterEach, describe, expect, it, vi } from "vitest";
import { getDeploymentVersion } from "@/lib/deployment-version";

describe("production deployment version", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("prefers the Vercel commit SHA and exposes only safe fields", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "ABCDEF1234567890abcdef1234567890abcdef12");
    vi.stubEnv("GITHUB_SHA", "1111111111111111111111111111111111111111");

    expect(getDeploymentVersion()).toEqual({
      commitSha: "abcdef1234567890abcdef1234567890abcdef12",
      shortSha: "abcdef123456",
      source: "VERCEL_GIT_COMMIT_SHA",
      tier: "production",
    });
  });

  it("falls back explicitly to unknown for missing or unsafe values", () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "secret=value");
    vi.stubEnv("GITHUB_SHA", "");
    vi.stubEnv("COMMIT_SHA", "");

    expect(getDeploymentVersion()).toEqual({
      commitSha: "unknown",
      shortSha: "unknown",
      source: "unknown",
      tier: "local",
    });
  });
});
