"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  applyRecommendedJiraFieldMappings,
  DEVPULSE_JIRA_FIELD_CATALOG,
  getJiraMappingReadiness,
  JIRA_FIELD_CATALOG_VERSION,
  JIRA_LOGICAL_FIELD_KEYS,
  syntheticJiraIdentityFieldOptions,
} from "@/lib/jira/field-mappings";
import { requirePermission } from "@/lib/auth/permissions";
import { resolveJiraApiToken } from "@/services/integrations/jira/auth";
import { JiraClient } from "@/services/integrations/jira/client";
import {
  getJiraIntegration,
  testJiraConnection,
  updateJiraIntegrationFieldMappings,
  updateJiraProjectFieldMappings,
  upsertJiraIntegration,
} from "@/services/integrations/jira";
import type { JiraFieldMappings } from "@/types/jira-integration";

export type JiraFormState = {
  error: string | null;
  success: string | null;
};

const initial: JiraFormState = { error: null, success: null };

export type JiraFieldOption = {
  id: string;
  name: string;
  custom: boolean;
  schemaType: string | null;
};

function parseProjectKeys(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\s,;]+/)
    .map((key) => key.trim().toUpperCase())
    .filter(Boolean);
}

function parseCatalogMappingsFromForm(formData: FormData): JiraFieldMappings {
  const fieldMappings: JiraFieldMappings = {};
  for (const key of JIRA_LOGICAL_FIELD_KEYS) {
    const meta = DEVPULSE_JIRA_FIELD_CATALOG.find((entry) => entry.key === key);
    if (meta?.linkedToKey) {
      continue;
    }
    const value = String(formData.get(`mapping_${key}`) ?? "").trim();
    if (value) {
      fieldMappings[key] = value;
    }
  }
  return fieldMappings;
}

async function requireIntegrationInTeamContext(formData: FormData) {
  const integrationId = String(formData.get("integrationId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  const integration = await getJiraIntegration(integrationId);

  if (!integration) {
    throw new Error("Integração não encontrada.");
  }
  if (!teamId || integration.team_id !== teamId) {
    throw new Error(
      "O contexto do time mudou. Recarregue a tela antes de executar a operação.",
    );
  }
  return integration;
}

export async function saveJiraIntegrationAction(
  _prev: JiraFormState,
  formData: FormData,
): Promise<JiraFormState> {
  await requirePermission("jira", "edit");

  const teamId = String(formData.get("teamId") ?? "");
  try {
    await upsertJiraIntegration({
      teamId,
      name: String(formData.get("name") ?? ""),
      baseUrl: String(formData.get("baseUrl") ?? ""),
      email: String(formData.get("email") ?? ""),
      apiTokenSecretRef: String(formData.get("apiTokenSecretRef") ?? ""),
      isEnabled: formData.get("isEnabled") === "on",
      projectKeys: parseProjectKeys(formData.get("projectKeys")),
      jqlExtra: String(formData.get("jqlExtra") ?? "").trim() || null,
      syncWindowDays: Number(formData.get("syncWindowDays") ?? 90),
      safetyOverlapMinutes: Number(formData.get("safetyOverlapMinutes") ?? 15),
      includeWorklogs: formData.get("includeWorklogs") === "on",
      includeChangelog: formData.get("includeChangelog") === "on",
      autoSyncCooldownMinutes: Number(
        formData.get("autoSyncCooldownMinutes") ?? 60,
      ),
      // field_mappings managed by the de/para catalog panel — do not wipe here.
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a integração.",
      success: null,
    };
  }

  revalidatePath("/app/jira");
  revalidatePath("/app/jira/analytics");
  redirect(`/app/jira?teamId=${encodeURIComponent(teamId)}&saved=1`);
}

export async function testJiraConnectionAction(
  _prev: JiraFormState,
  formData: FormData,
): Promise<JiraFormState> {
  await requirePermission("jira", "edit");

  try {
    const integration = await requireIntegrationInTeamContext(formData);
    const result = await testJiraConnection(integration);
    if (!result.ok) {
      return { error: result.error ?? "Conexão falhou.", success: null };
    }

    revalidatePath("/app/jira");
    revalidatePath("/app/jira/analytics");
    return {
      error: null,
      success: `Conexão OK · ${result.displayName ?? result.accountId} · ${result.projectCount ?? 0} projetos visíveis.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Falha ao testar conexão.",
      success: null,
    };
  }
}

export async function listJiraFieldsAction(input: {
  integrationId: string;
  teamId: string;
}): Promise<
  | { ok: true; fields: JiraFieldOption[] }
  | { ok: false; error: string }
> {
  try {
    await requirePermission("jira", "edit");
    const integration = await getJiraIntegration(input.integrationId);
    if (!integration) {
      return { ok: false, error: "Integração não encontrada." };
    }
    if (integration.team_id !== input.teamId) {
      return { ok: false, error: "Time inválido para esta integração." };
    }

    const apiToken = resolveJiraApiToken(integration.api_token_secret_ref);
    const client = new JiraClient({
      baseUrl: integration.base_url,
      email: integration.email,
      apiToken,
    });
    const fields = await client.getFields();
    const withIdentity = [...syntheticJiraIdentityFieldOptions(), ...fields];
    const deduped = new Map<string, JiraFieldOption>();
    for (const field of withIdentity) {
      if (!deduped.has(field.id)) {
        deduped.set(field.id, field);
      }
    }
    return {
      ok: true,
      fields: [...deduped.values()].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR"),
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível listar campos Jira.",
    };
  }
}

export async function saveJiraScopeFieldMappingsAction(
  _prev: JiraFormState,
  formData: FormData,
): Promise<JiraFormState> {
  await requirePermission("jira", "edit");

  try {
    const integration = await requireIntegrationInTeamContext(formData);
    const fieldMappings = parseCatalogMappingsFromForm(formData);
    const readiness = getJiraMappingReadiness(fieldMappings);
    const projectId = String(formData.get("projectId") ?? "").trim();

    // Always persist the active scope as the integration default so sync gate
    // and collectors keep a complete catalog for the selected team.
    await updateJiraIntegrationFieldMappings({
      integrationId: integration.id,
      fieldMappings,
      settingsPatch: {
        field_catalog_version: JIRA_FIELD_CATALOG_VERSION,
      },
    });

    let scopeLabel = "time";
    if (projectId) {
      const project = await updateJiraProjectFieldMappings({
        integrationId: integration.id,
        projectId,
        fieldMappings,
      });
      scopeLabel = `projeto ${project.key}`;
    }

    revalidatePath("/app/jira");
    revalidatePath("/app/jira/analytics");

    if (!readiness.ready) {
      return {
        error: null,
        success: `De/para de ${scopeLabel} salvo. Ainda faltam obrigatórios: ${readiness.pendingLabels.join(", ")}. Sync permanece bloqueada.`,
      };
    }

    return {
      error: null,
      success: `De/para de ${scopeLabel} salvo. Sync liberada.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o de/para.",
      success: null,
    };
  }
}

/** @deprecated Prefer saveJiraScopeFieldMappingsAction. */
export async function saveJiraIntegrationFieldMappingsAction(
  prev: JiraFormState,
  formData: FormData,
): Promise<JiraFormState> {
  return saveJiraScopeFieldMappingsAction(prev, formData);
}

export async function applyRecommendedJiraFieldMappingsAction(
  _prev: JiraFormState,
  formData: FormData,
): Promise<JiraFormState> {
  await requirePermission("jira", "edit");

  try {
    const integration = await requireIntegrationInTeamContext(formData);
    const apiToken = resolveJiraApiToken(integration.api_token_secret_ref);
    const client = new JiraClient({
      baseUrl: integration.base_url,
      email: integration.email,
      apiToken,
    });
    const fields = await client.getFields();
    const available = [
      ...syntheticJiraIdentityFieldOptions().map((field) => field.id),
      ...fields.map((field) => field.id),
    ];

    const next = applyRecommendedJiraFieldMappings({
      current: integration.field_mappings,
      availableFieldIds: available,
      availableFields: fields,
    });

    const readiness = getJiraMappingReadiness(next);
    await updateJiraIntegrationFieldMappings({
      integrationId: integration.id,
      fieldMappings: next,
      settingsPatch: {
        field_catalog_version: JIRA_FIELD_CATALOG_VERSION,
        recommendations_applied_at: new Date().toISOString(),
      },
    });

    revalidatePath("/app/jira");

    if (!readiness.ready) {
      return {
        error: null,
        success: `Recomendações aplicadas nos vazios. Ainda pendente: ${readiness.pendingLabels.join(", ")} (ex.: Entrega TU).`,
      };
    }

    return {
      error: null,
      success:
        "Recomendações aplicadas nos campos vazios. Revise o de/para — recomendado ≠ definitivo.",
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Não foi possível aplicar recomendações.",
      success: null,
    };
  }
}

export async function saveJiraProjectFieldMappingsAction(
  prev: JiraFormState,
  formData: FormData,
): Promise<JiraFormState> {
  return saveJiraScopeFieldMappingsAction(prev, formData);
}

export async function getInitialJiraFormState(): Promise<JiraFormState> {
  return initial;
}
