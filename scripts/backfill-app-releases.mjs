import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";

config({ path: process.env.DOTENV_CONFIG_PATH ?? ".env.local" });

const RECORD_SEPARATOR = "\x1e";
const FIELD_SEPARATOR = "\x1f";

function env(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function releaseTypeFromMessage(message) {
  if (/BREAKING CHANGE|!:/i.test(message)) {
    return "major";
  }
  if (/^feat(?:\(.+\))?:/im.test(message)) {
    return "minor";
  }
  return "patch";
}

function releaseVersion(baseVersion, commitSha) {
  const base = baseVersion.replace(/^v/i, "").replace(/\+.*/, "");
  return `v${base}+${commitSha.slice(0, 7)}`;
}

function readGitHistory() {
  const raw = git([
    "log",
    "--reverse",
    `--pretty=format:%H${FIELD_SEPARATOR}%cI${FIELD_SEPARATOR}%B${RECORD_SEPARATOR}`,
  ]);

  return raw
    .split(RECORD_SEPARATOR)
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const separator = record.indexOf(FIELD_SEPARATOR);
      const secondSeparator = record.indexOf(
        FIELD_SEPARATOR,
        separator + FIELD_SEPARATOR.length,
      );
      if (separator < 0 || secondSeparator < 0) {
        return null;
      }
      return {
        commitSha: record.slice(0, separator).trim(),
        releasedAt: record
          .slice(separator + FIELD_SEPARATOR.length, secondSeparator)
          .trim(),
        message: record
          .slice(secondSeparator + FIELD_SEPARATOR.length)
          .trim(),
      };
    })
    .filter((commit) => commit && commit.commitSha && commit.message);
}

async function supabaseRequest(path, init = {}) {
  return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}${path}`, {
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
  if (process.env.CONFIRM_BACKFILL !== "1") {
    throw new Error(
      "Backfill protegido. Execute com CONFIRM_BACKFILL=1 npm run backfill:releases.",
    );
  }

  const supabaseUrl = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.",
    );
  }

  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  const baseVersion = env("APP_VERSION") ?? packageJson.version;
  const history = readGitHistory();
  if (history.length === 0) {
    throw new Error("Nenhum commit foi encontrado no histórico Git.");
  }

  const existingResponse = await supabaseRequest(
    "/rest/v1/app_releases?select=commit_sha&commit_sha=not.is.null",
  );
  if (!existingResponse.ok) {
    throw new Error(
      `Não foi possível consultar o histórico atual: ${existingResponse.status} ${await existingResponse.text()}`,
    );
  }
  const existingRows = await existingResponse.json();
  const existingCommits = new Set(
    existingRows
      .map((row) => row.commit_sha)
      .filter((commitSha) => typeof commitSha === "string"),
  );

  const missing = history.filter(
    (commit) => !existingCommits.has(commit.commitSha),
  );
  if (missing.length === 0) {
    console.log(
      `[versionamento] backfill já está completo: ${history.length} commits encontrados`,
    );
    return;
  }

  const releases = missing.map((commit) => {
    const shortSha = commit.commitSha.slice(0, 7);
    return {
      version: releaseVersion(baseVersion, commit.commitSha),
      released_at: commit.releasedAt,
      release_type: releaseTypeFromMessage(commit.message),
      description:
        commit.message.split("\n").find((line) => line.trim()) ??
        `Commit ${shortSha}`,
      commit_descriptions: `${shortSha} — ${commit.message}`,
      commit_sha: commit.commitSha,
      source: "git-history",
    };
  });

  const response = await supabaseRequest("/rest/v1/app_releases", {
    method: "POST",
    headers: {
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(releases),
  });
  if (!response.ok) {
    throw new Error(
      `Não foi possível importar o histórico: ${response.status} ${await response.text()}`,
    );
  }

  console.log(
    `[versionamento] backfill concluído: ${releases.length} commits importados; ${existingCommits.size} já existiam`,
  );
}

try {
  await main();
} catch (error) {
  console.error(
    `[versionamento] backfill falhou: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
}
