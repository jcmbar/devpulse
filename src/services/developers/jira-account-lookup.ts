import "server-only";

import { validateJiraAccountId } from "@/lib/jira/account-id";
import { resolveJiraApiToken } from "@/services/integrations/jira/auth";
import { JiraApiError, JiraClient } from "@/services/integrations/jira/client";
import {
  getDeveloperAdmin,
  patchDeveloperListFieldsAdmin,
} from "@/services/developers";
import {
  listJiraIntegrations,
} from "@/services/integrations/jira";
import type { JiraIntegration } from "@/types/jira-integration";

export type JiraAccountLookupStatus =
  | "filled"
  | "skipped_existing"
  | "not_found"
  | "ambiguous"
  | "no_email"
  | "error";

export type JiraAccountLookupResult = {
  developerId: string;
  status: JiraAccountLookupStatus;
  message: string;
  accountId?: string | null;
  displayName?: string | null;
  candidateCount?: number;
  integrationId?: string | null;
};

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

async function resolveIntegrationForDeveloper(input: {
  teamId: string | null;
}): Promise<JiraIntegration> {
  const integrations = await listJiraIntegrations();
  const enabled = integrations.filter((row) => row.is_enabled);

  if (enabled.length === 0) {
    throw new Error("Nenhuma integração Jira habilitada.");
  }

  if (input.teamId) {
    const forTeam = enabled.find((row) => row.team_id === input.teamId);
    if (forTeam) {
      return forTeam;
    }
    throw new Error(
      "O time deste developer não tem integração Jira habilitada.",
    );
  }

  if (enabled.length === 1) {
    return enabled[0]!;
  }

  throw new Error(
    "Developer sem time. Vincule um time com integração Jira para buscar o Account ID.",
  );
}

/**
 * Decide fill vs ambiguous from Jira user/search hits for an email query.
 */
export function pickJiraAccountFromSearch(input: {
  email: string;
  users: Array<{
    accountId: string;
    displayName?: string;
    emailAddress?: string;
  }>;
}): {
  status: Extract<
    JiraAccountLookupStatus,
    "filled" | "not_found" | "ambiguous"
  >;
  accountId?: string;
  displayName?: string | null;
  candidateCount: number;
  message: string;
} {
  const email = normalizeEmail(input.email);
  const users = input.users.filter((user) => user.accountId);
  const emailMatches = users.filter(
    (user) =>
      user.emailAddress &&
      normalizeEmail(user.emailAddress) === email,
  );

  if (emailMatches.length === 1) {
    const hit = emailMatches[0]!;
    return {
      status: "filled",
      accountId: hit.accountId,
      displayName: hit.displayName ?? null,
      candidateCount: users.length,
      message: `Account ID encontrado via e-mail (${hit.displayName ?? hit.accountId}).`,
    };
  }

  if (emailMatches.length > 1) {
    return {
      status: "ambiguous",
      candidateCount: emailMatches.length,
      message: `${emailMatches.length} usuários Jira com o mesmo e-mail — revise manualmente.`,
    };
  }

  // Privacy: emailAddress often omitted. Single hit from email query is accepted.
  if (users.length === 1 && emailMatches.length === 0) {
    const hit = users[0]!;
    return {
      status: "filled",
      accountId: hit.accountId,
      displayName: hit.displayName ?? null,
      candidateCount: 1,
      message: `Account ID único na busca (e-mail oculto na API): ${hit.displayName ?? hit.accountId}.`,
    };
  }

  if (users.length === 0) {
    return {
      status: "not_found",
      candidateCount: 0,
      message: "Nenhum usuário Jira encontrado para este e-mail.",
    };
  }

  return {
    status: "ambiguous",
    candidateCount: users.length,
    message: `${users.length} candidatos na busca e nenhum e-mail explícito compatível — revise manualmente.`,
  };
}

export async function lookupAndFillDeveloperJiraAccount(input: {
  developerId: string;
  /** When true, overwrite an existing jira_account_id. */
  force?: boolean;
}): Promise<JiraAccountLookupResult> {
  const developer = await getDeveloperAdmin(input.developerId);
  if (!developer) {
    return {
      developerId: input.developerId,
      status: "error",
      message: "Developer não encontrado.",
    };
  }

  if (developer.jira_account_id?.trim() && !input.force) {
    return {
      developerId: developer.id,
      status: "skipped_existing",
      accountId: developer.jira_account_id,
      message: "Já possui Jira Account ID — não sobrescrito.",
    };
  }

  const email = developer.email?.trim() ?? "";
  if (!email || !email.includes("@")) {
    return {
      developerId: developer.id,
      status: "no_email",
      message: "Developer sem e-mail cadastrado.",
    };
  }

  let integration: JiraIntegration;
  try {
    integration = await resolveIntegrationForDeveloper({
      teamId: developer.team_id,
    });
  } catch (error) {
    return {
      developerId: developer.id,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Falha ao resolver integração Jira.",
    };
  }

  try {
    const apiToken = resolveJiraApiToken(integration.api_token_secret_ref);
    const client = new JiraClient({
      baseUrl: integration.base_url,
      email: integration.email,
      apiToken,
    });

    const users = await client.searchUsers({ query: email, maxResults: 20 });
    const pick = pickJiraAccountFromSearch({ email, users });

    if (pick.status !== "filled" || !pick.accountId) {
      return {
        developerId: developer.id,
        status: pick.status,
        message: pick.message,
        candidateCount: pick.candidateCount,
        integrationId: integration.id,
      };
    }

    const validationError = validateJiraAccountId(pick.accountId);
    if (validationError) {
      return {
        developerId: developer.id,
        status: "error",
        message: validationError,
        integrationId: integration.id,
      };
    }

    await patchDeveloperListFieldsAdmin({
      developerId: developer.id,
      jiraAccountId: pick.accountId,
    });

    return {
      developerId: developer.id,
      status: "filled",
      accountId: pick.accountId,
      displayName: pick.displayName ?? null,
      candidateCount: pick.candidateCount,
      integrationId: integration.id,
      message: `${pick.message} Autopreenchido.`,
    };
  } catch (error) {
    if (error instanceof JiraApiError) {
      return {
        developerId: developer.id,
        status: "error",
        message: `Jira API (${error.status}): ${error.message}${
          error.body ? ` — ${error.body.slice(0, 160)}` : ""
        }`,
        integrationId: integration.id,
      };
    }
    return {
      developerId: developer.id,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Falha ao buscar usuário no Jira.",
      integrationId: integration.id,
    };
  }
}

export async function batchLookupDeveloperJiraAccounts(input: {
  developerIds: string[];
  force?: boolean;
}): Promise<JiraAccountLookupResult[]> {
  const unique = [...new Set(input.developerIds.map((id) => id.trim()).filter(Boolean))];
  const results: JiraAccountLookupResult[] = [];

  for (const developerId of unique) {
    results.push(
      await lookupAndFillDeveloperJiraAccount({
        developerId,
        force: input.force,
      }),
    );
  }

  return results;
}
