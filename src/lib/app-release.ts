/** Stable identifier for one Vercel deployment. Does not expose secrets. */
export type AppRelease = { id: string; label: string };

export function getAppRelease(): AppRelease {
  const id =
    process.env.VERCEL_DEPLOYMENT_ID?.trim() ||
    process.env.APP_RELEASE_ID?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    "local-development";
  const label = process.env.APP_VERSION_LABEL?.trim() || `빌드 ${id.slice(0, 8)}`;
  return { id, label };
}
