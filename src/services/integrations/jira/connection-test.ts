import "server-only";

import { resolveJiraApiToken } from "@/services/integrations/jira/auth";
import { JiraApiError, JiraClient } from "@/services/integrations/jira/client";
import type { JiraIntegration } from "@/types/jira-integration";

export type JiraConnectionTestResult = {
  ok: boolean;
  accountId?: string;
  displayName?: string;
  emailAddress?: string;
  projectCount?: number;
  error?: string;
};

export async function testJiraConnection(
  integration: Pick<
    JiraIntegration,
    "base_url" | "email" | "api_token_secret_ref"
  >,
): Promise<JiraConnectionTestResult> {
  try {
    const apiToken = resolveJiraApiToken(integration.api_token_secret_ref);
    const client = new JiraClient({
      baseUrl: integration.base_url,
      email: integration.email,
      apiToken,
    });

    const me = await client.getMyself();
    const projects = await client.getProjects();

    return {
      ok: true,
      accountId: me.accountId,
      displayName: me.displayName,
      emailAddress: me.emailAddress,
      projectCount: projects.length,
    };
  } catch (error) {
    if (error instanceof JiraApiError) {
      return {
        ok: false,
        error: `${error.message}${error.body ? ` — ${error.body.slice(0, 240)}` : ""}`,
      };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha ao testar conexão.",
    };
  }
}
