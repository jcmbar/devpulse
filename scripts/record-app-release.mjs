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

function githubRepository(packageJson) {
  const configured = env("APP_GITHUB_REPOSITORY");
  const packageRepository =
    typeof packageJson.repository === "string"
      ? packageJson.repository
      : packageJson.repository?.url;
  const raw = configured ?? packageRepository;
  const match = raw?.match(/github\.com[/:]([^/]+\/[^/#]+?)(?:\.git)?$/i);
  return match?.[1] ?? null;
}

async function githubRequest(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "devpulse-versionamento",
  };
  const token = env("GITHUB_TOKEN");
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    return null;
  }
  return response.json();
}

function formatGithubCommit(commit) {
  const sha = String(commit.sha ?? "");
  const message = String(commit.commit?.message ?? "").trim();
  return sha && message ? `${sha.slice(0, 7)} — ${message}` : null;
}

async function githubCommitDescriptions({
  repository,
  previousSha,
  commitSha,
}) {
  if (!repository) {
    return null;
  }
  const data =
    previousSha && previousSha !== commitSha
      ? await githubRequest(
          `/repos/${repository}/compare/${previousSha}...${commitSha}`,
        )
      : await githubRequest(`/repos/${repository}/commits/${commitSha}`);
  if (!data) {
    return null;
  }
  const commits = Array.isArray(data.commits) ? data.commits : [data];
  const formatted = commits.map(formatGithubCommit).filter(Boolean);
  return formatted.length > 0 ? formatted.join("\n\n") : null;
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
  const baseVersion = env("APP_VERSION") ?? packageJson.version;
  const commitSha = env("RENDER_GIT_COMMIT") ?? git(["rev-parse", "HEAD"]);
  if (!commitSha) {
    console.log("[versionamento] release registration skipped: commit unavailable");
    return;
  }

  const repository = githubRepository(packageJson);
  const existingResponse = await supabaseRequest(
    `/rest/v1/app_releases?select=id,description,commit_descriptions&commit_sha=eq.${encodeURIComponent(commitSha)}&limit=1`,
  );
  if (!existingResponse.ok) {
    console.warn(
      `[versionamento] release registration skipped: ${existingResponse.status} ${await existingResponse.text()}`,
    );
    return;
  }
  const existing = (await existingResponse.json())[0];
  const currentGithubDescriptions = await githubCommitDescriptions({
    repository,
    previousSha: null,
    commitSha,
  });
  if (existing) {
    if (
      currentGithubDescriptions &&
      existing.commit_descriptions.includes("Deploy automático")
    ) {
      const firstCommitLine =
        currentGithubDescriptions.split("\n").find((line) => line.trim()) ??
        `Commit ${commitSha.slice(0, 7)}`;
      const repairResponse = await supabaseRequest(
        `/rest/v1/app_releases?id=eq.${encodeURIComponent(existing.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            description: firstCommitLine,
            commit_descriptions: currentGithubDescriptions,
          }),
        },
      );
      if (repairResponse.ok) {
        console.log(
          `[versionamento] repaired commit description for ${commitSha.slice(0, 7)}`,
        );
      }
    } else {
      console.log(
        `[versionamento] release already registered for ${commitSha.slice(0, 7)}`,
      );
    }
    return;
  }

  const latestResponse = await supabaseRequest(
    "/rest/v1/app_releases?select=commit_sha&commit_sha=not.is.null&order=released_at.desc&limit=1",
  );
  const latest = latestResponse.ok ? await latestResponse.json() : [];
  const previousSha = latest[0]?.commit_sha;
  const comparedGithubDescriptions = await githubCommitDescriptions({
    repository,
    previousSha,
    commitSha,
  });
  const logArgs = previousSha && previousSha !== commitSha
    ? ["log", `${previousSha}..${commitSha}`, "--pretty=format:%h — %s%n%b"]
    : ["log", "-20", "--pretty=format:%h — %s%n%b"];
  const commitDescriptions =
    git(logArgs) ||
    comparedGithubDescriptions ||
    currentGithubDescriptions ||
    `${commitSha.slice(0, 7)} — Deploy automático`;
  const firstCommitLine =
    commitDescriptions.split("\n").find((line) => line.trim()) ??
    "Deploy automático";
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
