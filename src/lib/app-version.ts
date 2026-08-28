import packageJson from "../../package.json";

export type AppBuildInfo = {
  version: string;
  commitSha: string | null;
  label: string;
};

function firstNonEmpty(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

/**
 * Build identity shown in public UI. APP_VERSION can be set in Render, while
 * RENDER_GIT_COMMIT identifies the exact source revision deployed there.
 */
export function getAppBuildInfo(): AppBuildInfo {
  const version = firstNonEmpty(
    process.env.APP_VERSION,
    process.env.NEXT_PUBLIC_APP_VERSION,
    packageJson.version,
  )!;
  const commitSha = firstNonEmpty(
    process.env.RENDER_GIT_COMMIT,
    process.env.GIT_COMMIT_SHA,
    process.env.NEXT_PUBLIC_BUILD_SHA,
  );
  const normalizedVersion = version.startsWith("v") ? version : `v${version}`;

  return {
    version: normalizedVersion,
    commitSha,
    label: commitSha
      ? `${normalizedVersion} · ${commitSha.slice(0, 7)}`
      : normalizedVersion,
  };
}
