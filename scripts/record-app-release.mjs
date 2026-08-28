import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

function git(args) {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function env(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function releaseTypeFromCommits(commits) {
  if (/BREAKING CHANGE|!:/i.test(commits)) {
    return "major";
  }
  if (/^feat(?:\(.+\))?:/im.test(commits)) {
    return "minor";
  }
  return "patch";
}

function releaseVersion(baseVersion, commitSha) {
  const base = baseVersion.replace(/^v/i, "").replace(/\+.*/, "");
  return `v${base}+${commitSha.slice(0, 7)}`;
}

async function supabaseRequest(path, init = {}) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function main() {
  // Local builds must never write release records accidentally.
  if (!env("SUPABASE_SERVICE_ROLE_KEY") || !env("NEXT_PUBLIC_SUPABASE_URL")) {
    console.log("[versionamento] release registration skipped: missing Supabase server credentials");
    return;
  }

  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const commitSha = env("RENDER_GIT_COMMIT") ?? git(["rev-parse", "HEAD"]);
  if (!commitSha) {
    console.log("[versionamento] release registration skipped: commit unavailable");
    return;
  }

  const existingResponse = await supabaseRequest(
    `/rest/v1/app_releases?select=id&commit_sha=eq.${encodeURIComponent(commitSha)}&limit=1`,
  );
  if (!existingResponse.ok) {
    console.warn(
      `[versionamento] release registration skipped: ${existingResponse.status} ${await existingResponse.text()}`,
    );
    return;
  }
  if ((await existingResponse.json()).length > 0) {
    console.log(`[versionamento] release already registered for ${commitSha.slice(0, 7)}`);
    return;
  }

  const latestResponse = await supabaseRequest(
    "/rest/v1/app_releases?select=commit_sha&commit_sha=not.is.null&order=released_at.desc&limit=1",
  );
  const latest = latestResponse.ok ? await latestResponse.json() : [];
  const previousSha = latest[0]?.commit_sha;
  const logArgs = previousSha && previousSha !== commitSha
    ? ["log", `${previousSha}..${commitSha}`, "--pretty=format:%h — %s%n%b"]
    : ["log", "-20", "--pretty=format:%h — %s%n%b"];
  const commitDescriptions =
    git(logArgs) || `${commitSha.slice(0, 7)} — Deploy automático`;
  const firstCommitLine =
    commitDescriptions.split("\n").find((line) => line.trim()) ??
    "Deploy automático";
  const baseVersion = env("APP_VERSION") ?? packageJson.version;
  const release = {
    version: releaseVersion(baseVersion, commitSha),
    released_at: new Date().toISOString(),
    release_type: releaseTypeFromCommits(commitDescriptions),
    description: firstCommitLine,
    commit_descriptions: commitDescriptions,
    commit_sha: commitSha,
    source: "render",
  };

  const response = await supabaseRequest("/rest/v1/app_releases", {
    method: "POST",
    headers: {
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(release),
  });
  if (!response.ok) {
    console.warn(
      `[versionamento] release registration failed: ${response.status} ${await response.text()}`,
    );
    return;
  }

  console.log(
    `[versionamento] registered ${release.version} from commit ${commitSha.slice(0, 7)}`,
  );
}

await main();
