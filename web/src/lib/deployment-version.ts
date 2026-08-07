import { getDeploymentTier, type DeploymentTier } from "@/lib/deployment-env";

export type DeploymentVersion = {
  commitSha: string;
  shortSha: string;
  source: "VERCEL_GIT_COMMIT_SHA" | "GITHUB_SHA" | "COMMIT_SHA" | "unknown";
  tier: DeploymentTier;
};

function safeCommitSha(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || !/^[0-9a-f]{7,64}$/i.test(candidate)) return null;
  return candidate.toLowerCase();
}

/** Safe deployment identity for diagnostics and telemetry; never exposes arbitrary env values. */
export function getDeploymentVersion(
  env: NodeJS.ProcessEnv = process.env,
): DeploymentVersion {
  const candidates = [
    ["VERCEL_GIT_COMMIT_SHA", env.VERCEL_GIT_COMMIT_SHA],
    ["GITHUB_SHA", env.GITHUB_SHA],
    ["COMMIT_SHA", env.COMMIT_SHA],
  ] as const;

  for (const [source, raw] of candidates) {
    const commitSha = safeCommitSha(raw);
    if (commitSha) {
      return {
        commitSha,
        shortSha: commitSha.slice(0, 12),
        source,
        tier: getDeploymentTier(),
      };
    }
  }

  return {
    commitSha: "unknown",
    shortSha: "unknown",
    source: "unknown",
    tier: getDeploymentTier(),
  };
}
