import "server-only";

import {
  detectJiraKeyPrefixes,
  type DetectedImportPrefixes,
} from "@/lib/imports/jira-key-prefix";
import { findTeamByJiraKeyPrefix } from "@/services/teams";
import type { Team } from "@/types/team";

export type ResolveImportTeamResult =
  | {
      ok: true;
      team: Team;
      detection: DetectedImportPrefixes;
      prefix: string;
    }
  | {
      ok: false;
      error: string;
      detection: DetectedImportPrefixes;
    };

/**
 * Resolve the single team for an import file from Jira key prefixes.
 * Fails on mixed prefixes or unknown/inactive prefix (no silent fallback).
 */
export async function resolveImportTeamFromKeys(
  jiraKeys: string[],
): Promise<ResolveImportTeamResult> {
  const detection = detectJiraKeyPrefixes(jiraKeys);

  if (detection.keysWithPrefix === 0) {
    return {
      ok: false,
      detection,
      error:
        "Nenhuma chave Jira válida (formato PROJETO-123) foi encontrada no arquivo.",
    };
  }

  if (detection.prefixes.length > 1) {
    const detail = detection.prefixes
      .map((prefix) => {
        const samples = detection.samplesByPrefix[prefix]?.join(", ") ?? prefix;
        return `${prefix} (ex.: ${samples})`;
      })
      .join("; ");
    return {
      ok: false,
      detection,
      error: `Arquivo mistura prefixos de times diferentes: ${detail}. Separe as planilhas por time antes de importar.`,
    };
  }

  const prefix = detection.prefixes[0];
  const team = await findTeamByJiraKeyPrefix(prefix);

  if (!team) {
    return {
      ok: false,
      detection,
      error: `Prefixo Jira "${prefix}" não está cadastrado em nenhum time ativo. Cadastre o time em /app/teams (prefixo = ${prefix}) e tente novamente.`,
    };
  }

  return {
    ok: true,
    team,
    detection,
    prefix,
  };
}
