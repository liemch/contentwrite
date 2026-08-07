# Production Version Verification

## Purpose

An admin can confirm that production runs the commit containing WP2.5/WP2.6/WP2.7 without
reading runtime logs.

## Metadata source

Priority:

1. `VERCEL_GIT_COMMIT_SHA` (Vercel-provided);
2. `GITHUB_SHA`;
3. `COMMIT_SHA`;
4. literal `unknown`.

Only a 7–64 character hexadecimal SHA is accepted. The endpoint does not return secrets,
environment-variable dumps, provider configuration or deployment tokens.

## Verify after deployment

1. Open Vercel Dashboard → ContentWrite project → Deployments.
2. Select the production deployment and copy its Git commit SHA.
3. Log into ContentWrite as admin.
4. Open Settings → **Production version**, or call:

```bash
curl --cookie "<admin-session-cookie>" https://<production-host>/api/health/version
```

5. Compare `version.commitSha` with the SHA shown by Vercel.
6. Record deployment SHA and cohort version in the private validation manifest.

Expected response shape:

```json
{
  "version": {
    "commitSha": "<full-sha-or-unknown>",
    "shortSha": "<12-char-sha-or-unknown>",
    "source": "VERCEL_GIT_COMMIT_SHA",
    "tier": "production"
  }
}
```

## Failure handling

- `401/403`: verify admin session; endpoint is intentionally not public.
- `unknown`: confirm Vercel System Environment Variables are exposed to the runtime and redeploy.
  Do not invent a SHA or infer it from timestamps.
- SHA mismatch: do not start/continue the cohort. Promote the intended deployment or document a
  new cohort version.

No new required application secret or custom env variable is introduced by WP2.7.

