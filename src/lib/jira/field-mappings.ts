import type { JiraFieldMappings } from "@/types/jira-integration";

/** Bump when catalog keys/semantics change (stored in integration settings). */
export const JIRA_FIELD_CATALOG_VERSION = 1;

export const JIRA_LOGICAL_FIELD_KEYS = [
  "jira_key",
  "jira_id",
  "summary",
  "issue_type",
  "status",
  "status_category",
  "priority",
  "labels",
  "assignee",
  "reporter",
  "project",
  "created_at_jira",
  "updated_at_jira",
  "resolved_at_jira",
  "unit_test_delivery_on",
  "story_points",
  "due_on",
  "estimate_hours",
  "parent_key",
] as const;

export type JiraLogicalFieldKey = (typeof JIRA_LOGICAL_FIELD_KEYS)[number];

export type JiraFieldValueKind =
  | "string"
  | "user"
  | "datetime"
  | "date"
  | "number"
  | "string[]"
  | "status"
  | "status_category"
  | "issuetype"
  | "priority"
  | "project"
  | "parent"
  | "issue_key"
  | "issue_id"
  | "estimate_seconds";

export type JiraFieldConsumer =
  | "sync"
  | "compilado"
  | "gestor"
  | "analytics";

export type JiraLogicalFieldMeta = {
  key: JiraLogicalFieldKey;
  label: string;
  description: string;
  /** Blocks sync when unset at integration level. */
  required: boolean;
  /** Suggestion only — never auto-persisted. */
  recommendedJiraFieldId: string | null;
  valueKind: JiraFieldValueKind;
  projectScopeDefault: "integration" | "project_override_allowed";
  consumers: JiraFieldConsumer[];
  /**
   * When set, this catalog row has no independent Jira select; readiness
   * follows the linked key (e.g. status_category ← status).
   */
  linkedToKey?: JiraLogicalFieldKey;
  /** @deprecated Prefer any field id; kept for callers that still check. */
  requireCustomFieldId?: boolean;
};

/** Canonical DevPulse ← Jira field catalog (single source of truth). */
export const DEVPULSE_JIRA_FIELD_CATALOG: JiraLogicalFieldMeta[] = [
  {
    key: "jira_key",
    label: "Chave da issue",
    description: "Identificador legível (ex.: AP-1234).",
    required: true,
    recommendedJiraFieldId: "key",
    valueKind: "issue_key",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado", "gestor", "analytics"],
  },
  {
    key: "jira_id",
    label: "Id interno Jira",
    description: "Id numérico/string estável usado no upsert.",
    required: true,
    recommendedJiraFieldId: "id",
    valueKind: "issue_id",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync"],
  },
  {
    key: "summary",
    label: "Resumo",
    description: "Título do card no Compilado e nas listagens.",
    required: true,
    recommendedJiraFieldId: "summary",
    valueKind: "string",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado", "gestor", "analytics"],
  },
  {
    key: "issue_type",
    label: "Tipo de issue",
    description: "Story, Bug, Task, etc.",
    required: true,
    recommendedJiraFieldId: "issuetype",
    valueKind: "issuetype",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "analytics"],
  },
  {
    key: "status",
    label: "Status",
    description: "Status atual; também alimenta o changelog de fluxo.",
    required: true,
    recommendedJiraFieldId: "status",
    valueKind: "status",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado", "gestor", "analytics"],
  },
  {
    key: "status_category",
    label: "Categoria do status",
    description:
      "Derivada do campo Status mapeado (statusCategory). Não exige select próprio.",
    required: true,
    recommendedJiraFieldId: null,
    valueKind: "status_category",
    linkedToKey: "status",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "analytics"],
  },
  {
    key: "priority",
    label: "Prioridade",
    description: "Prioridade da issue (persistência).",
    required: false,
    recommendedJiraFieldId: "priority",
    valueKind: "priority",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync"],
  },
  {
    key: "labels",
    label: "Categorias / Labels",
    description: "Vira `categories` no Compilado.",
    required: false,
    recommendedJiraFieldId: "labels",
    valueKind: "string[]",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado", "gestor"],
  },
  {
    key: "assignee",
    label: "Responsável",
    description:
      "Account id do assignee; liga ao developer DevPulse (`jira_account_id`).",
    required: true,
    recommendedJiraFieldId: "assignee",
    valueKind: "user",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado", "gestor", "analytics"],
  },
  {
    key: "reporter",
    label: "Reporter",
    description: "Quem criou/reportou a issue.",
    required: false,
    recommendedJiraFieldId: "reporter",
    valueKind: "user",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync"],
  },
  {
    key: "project",
    label: "Projeto",
    description: "Projeto Jira da issue (escopo e FK local).",
    required: true,
    recommendedJiraFieldId: "project",
    valueKind: "project",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "analytics"],
  },
  {
    key: "created_at_jira",
    label: "Criado em",
    description: "Timestamp de criação (aging / lead).",
    required: true,
    recommendedJiraFieldId: "created",
    valueKind: "datetime",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "analytics"],
  },
  {
    key: "updated_at_jira",
    label: "Atualizado em",
    description: "Usado no cursor de sync incremental.",
    required: true,
    recommendedJiraFieldId: "updated",
    valueKind: "datetime",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync"],
  },
  {
    key: "resolved_at_jira",
    label: "Resolvido em",
    description: "Data de resolução (completed_on / throughput).",
    required: true,
    recommendedJiraFieldId: "resolutiondate",
    valueKind: "datetime",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado", "analytics"],
  },
  {
    key: "unit_test_delivery_on",
    label: "Entrega p/ Teste Unitário",
    description:
      "Data do eixo Compilado / Gestor. Sem valor na issue o card não entra nos totais. Recomendado ≠ obrigatório de mapping — escolha o custom field correto do projeto.",
    required: true,
    recommendedJiraFieldId: null,
    valueKind: "date",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado", "gestor"],
  },
  {
    key: "story_points",
    label: "Story points",
    description: "Pontos de história (opcional).",
    required: false,
    recommendedJiraFieldId: null,
    valueKind: "number",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "analytics"],
  },
  {
    key: "due_on",
    label: "Data de vencimento",
    description: "Due date para calcular atraso (delay_days) no Compilado.",
    required: false,
    recommendedJiraFieldId: "duedate",
    valueKind: "date",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado", "gestor"],
  },
  {
    key: "estimate_hours",
    label: "Estimativa",
    description:
      "Estimativa original (Jira costuma expor segundos; convertidos para horas).",
    required: false,
    recommendedJiraFieldId: "timeoriginalestimate",
    valueKind: "estimate_seconds",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado", "gestor"],
  },
  {
    key: "parent_key",
    label: "Issue pai / Epic",
    description: "Chave do parent (ex.: epic link / parent).",
    required: false,
    recommendedJiraFieldId: "parent",
    valueKind: "parent",
    projectScopeDefault: "project_override_allowed",
    consumers: ["sync", "compilado"],
  },
];

/** @deprecated Prefer DEVPULSE_JIRA_FIELD_CATALOG. */
export const JIRA_LOGICAL_FIELDS = DEVPULSE_JIRA_FIELD_CATALOG;

export type JiraFieldMappingSource = "project" | "integration" | "none";

export type ResolvedJiraFieldMappings = {
  mappings: JiraFieldMappings;
  sources: Partial<Record<JiraLogicalFieldKey, JiraFieldMappingSource>>;
  projectKey: string | null;
};

export type JiraMappingReadiness = {
  ready: boolean;
  pendingKeys: JiraLogicalFieldKey[];
  pendingLabels: string[];
};

export type JiraCatalogRowStatus = "mapped" | "pending";

export type JiraCatalogRowView = {
  key: JiraLogicalFieldKey;
  label: string;
  description: string;
  required: boolean;
  jiraFieldSelected: string | null;
  jiraFieldRecommended: string | null;
  projectScope: JiraFieldMappingSource;
  status: JiraCatalogRowStatus;
  linkedToKey?: JiraLogicalFieldKey;
};

export function asJiraFieldMappings(value: unknown): JiraFieldMappings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const out: JiraFieldMappings = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "string" && raw.trim()) {
      out[key] = raw.trim();
    }
  }
  return out;
}

export function isCustomFieldId(value: string): boolean {
  return /^customfield_\d+$/i.test(value.trim());
}

export function catalogEntry(
  key: JiraLogicalFieldKey,
): JiraLogicalFieldMeta | undefined {
  return DEVPULSE_JIRA_FIELD_CATALOG.find((entry) => entry.key === key);
}

/**
 * Resolve effective mappings for one issue/project.
 * Priority: project override → integration default → unset.
 */
export function resolveJiraFieldMappings(input: {
  projectKey?: string | null;
  projectMappings?: JiraFieldMappings | null;
  integrationMappings: JiraFieldMappings;
}): ResolvedJiraFieldMappings {
  const projectKey = input.projectKey?.trim().toUpperCase() || null;
  const project = asJiraFieldMappings(input.projectMappings);
  const integration = asJiraFieldMappings(input.integrationMappings);
  const mappings: JiraFieldMappings = {};
  const sources: Partial<Record<JiraLogicalFieldKey, JiraFieldMappingSource>> =
    {};

  for (const meta of DEVPULSE_JIRA_FIELD_CATALOG) {
    if (meta.linkedToKey) {
      continue;
    }
    const fromProject = project[meta.key]?.trim();
    if (fromProject) {
      mappings[meta.key] = fromProject;
      sources[meta.key] = "project";
      continue;
    }
    const fromIntegration = integration[meta.key]?.trim();
    if (fromIntegration) {
      mappings[meta.key] = fromIntegration;
      sources[meta.key] = "integration";
      continue;
    }
    sources[meta.key] = "none";
  }

  for (const meta of DEVPULSE_JIRA_FIELD_CATALOG) {
    if (!meta.linkedToKey) {
      continue;
    }
    const linkedSource = sources[meta.linkedToKey] ?? "none";
    sources[meta.key] = linkedSource;
    const linkedId = mappings[meta.linkedToKey];
    if (linkedId) {
      mappings[meta.key] = linkedId;
    }
  }

  // Preserve any future/extra keys from project then integration.
  for (const [key, value] of Object.entries(project)) {
    if (value && mappings[key] == null) {
      mappings[key] = value;
    }
  }
  for (const [key, value] of Object.entries(integration)) {
    if (value && mappings[key] == null) {
      mappings[key] = value;
    }
  }

  return { mappings, sources, projectKey };
}

/** Whether a catalog key counts as mapped for readiness / UI status. */
export function isCatalogKeyMapped(
  key: JiraLogicalFieldKey,
  mappings: JiraFieldMappings,
): boolean {
  const meta = catalogEntry(key);
  if (!meta) {
    return Boolean(mappings[key]?.trim());
  }
  if (meta.linkedToKey) {
    return Boolean(mappings[meta.linkedToKey]?.trim());
  }
  return Boolean(mappings[key]?.trim());
}

/**
 * Integration-level readiness: all required catalog keys must be mapped
 * (or satisfied via linkedToKey) before sync is allowed.
 */
export function getJiraMappingReadiness(
  integrationMappings: JiraFieldMappings,
): JiraMappingReadiness {
  const mappings = asJiraFieldMappings(integrationMappings);
  const pendingKeys: JiraLogicalFieldKey[] = [];
  const pendingLabels: string[] = [];

  for (const meta of DEVPULSE_JIRA_FIELD_CATALOG) {
    if (!meta.required) {
      continue;
    }
    if (!isCatalogKeyMapped(meta.key, mappings)) {
      pendingKeys.push(meta.key);
      pendingLabels.push(meta.label);
    }
  }

  return {
    ready: pendingKeys.length === 0,
    pendingKeys,
    pendingLabels,
  };
}

export function buildJiraCatalogRows(input: {
  integrationMappings: JiraFieldMappings;
  projectMappings?: JiraFieldMappings | null;
  projectKey?: string | null;
}): JiraCatalogRowView[] {
  const resolved = resolveJiraFieldMappings({
    projectKey: input.projectKey,
    projectMappings: input.projectMappings,
    integrationMappings: input.integrationMappings,
  });

  return DEVPULSE_JIRA_FIELD_CATALOG.map((meta) => {
    const source = resolved.sources[meta.key] ?? "none";
    const selected = meta.linkedToKey
      ? (resolved.mappings[meta.linkedToKey] ?? null)
      : (resolved.mappings[meta.key] ?? null);
    return {
      key: meta.key,
      label: meta.label,
      description: meta.description,
      required: meta.required,
      jiraFieldSelected: selected,
      jiraFieldRecommended: meta.recommendedJiraFieldId,
      projectScope: source,
      status: selected ? "mapped" : "pending",
      linkedToKey: meta.linkedToKey,
    };
  });
}

/**
 * Field ids to request on `/search/jql`.
 * Excludes issue root identity (key/id) and linked-only rows.
 */
export function collectSearchJiraFieldIds(
  integrationMappings: JiraFieldMappings,
  projectMappingsList: JiraFieldMappings[] = [],
): string[] {
  const resolvedIds = new Set<string>();
  const pushMapped = (mappings: JiraFieldMappings) => {
    for (const meta of DEVPULSE_JIRA_FIELD_CATALOG) {
      if (
        meta.valueKind === "issue_key" ||
        meta.valueKind === "issue_id" ||
        meta.linkedToKey
      ) {
        continue;
      }
      const id = mappings[meta.key]?.trim();
      if (id) {
        resolvedIds.add(id);
      }
    }
  };

  pushMapped(asJiraFieldMappings(integrationMappings));
  for (const projectMappings of projectMappingsList) {
    pushMapped(asJiraFieldMappings(projectMappings));
  }

  // Also include any extra mapped ids not in the catalog yet.
  for (const value of Object.values(asJiraFieldMappings(integrationMappings))) {
    if (value?.trim() && value !== "key" && value !== "id") {
      resolvedIds.add(value.trim());
    }
  }
  for (const projectMappings of projectMappingsList) {
    for (const value of Object.values(asJiraFieldMappings(projectMappings))) {
      if (value?.trim() && value !== "key" && value !== "id") {
        resolvedIds.add(value.trim());
      }
    }
  }

  return [...resolvedIds];
}

/** @deprecated Prefer collectSearchJiraFieldIds. */
export function collectMappedJiraFieldIds(
  integrationMappings: JiraFieldMappings,
  projectMappingsList: JiraFieldMappings[],
): string[] {
  return collectSearchJiraFieldIds(integrationMappings, projectMappingsList);
}

/**
 * Fill only empty keys with catalog recommendations present in `availableFieldIds`.
 * Does not overwrite existing selections.
 */
export function applyRecommendedJiraFieldMappings(input: {
  current: JiraFieldMappings;
  availableFieldIds?: Iterable<string> | null;
  /** Soft name match for unmapped optional recommendations (story points, Entrega TU). */
  availableFields?: Array<{ id: string; name: string }> | null;
}): JiraFieldMappings {
  const current = asJiraFieldMappings(input.current);
  const available = input.availableFieldIds
    ? new Set(
        [...input.availableFieldIds].map((id) => id.trim()).filter(Boolean),
      )
    : null;
  const out: JiraFieldMappings = { ...current };

  for (const meta of DEVPULSE_JIRA_FIELD_CATALOG) {
    if (meta.linkedToKey || out[meta.key]?.trim()) {
      continue;
    }
    let recommended = meta.recommendedJiraFieldId;
    if (
      !recommended &&
      input.availableFields &&
      (meta.key === "unit_test_delivery_on" || meta.key === "story_points")
    ) {
      recommended = suggestJiraFieldIdByName(meta.key, input.availableFields);
    }
    if (!recommended) {
      continue;
    }
    if (
      meta.valueKind === "issue_key" ||
      meta.valueKind === "issue_id" ||
      !available ||
      available.has(recommended)
    ) {
      out[meta.key] = recommended;
    }
  }

  return out;
}

export function suggestJiraFieldIdByName(
  key: JiraLogicalFieldKey,
  fields: Array<{ id: string; name: string }>,
): string | null {
  const normalized = fields.map((field) => ({
    id: field.id,
    name: field.name.toLowerCase(),
  }));

  if (key === "unit_test_delivery_on") {
    const hit = normalized.find(
      (field) =>
        field.id.startsWith("customfield_") &&
        field.name.includes("entrega") &&
        (field.name.includes("teste unit") ||
          field.name.includes("testes unit") ||
          field.name.includes("tu")),
    );
    return hit?.id ?? null;
  }

  if (key === "story_points") {
    const hit = normalized.find(
      (field) =>
        field.name.includes("story point") ||
        field.name === "story points" ||
        field.name === "story point",
    );
    return hit?.id ?? null;
  }

  return null;
}

/** Synthetic options for issue root identity (often absent from GET /field). */
export function syntheticJiraIdentityFieldOptions(): Array<{
  id: string;
  name: string;
  custom: boolean;
  schemaType: string | null;
}> {
  return [
    {
      id: "key",
      name: "Issue Key (raiz)",
      custom: false,
      schemaType: "string",
    },
    {
      id: "id",
      name: "Issue Id (raiz)",
      custom: false,
      schemaType: "string",
    },
  ];
}

export function mappingSourceLabel(source: JiraFieldMappingSource): string {
  switch (source) {
    case "project":
      return "Projeto";
    case "integration":
      return "Padrão da integração";
    case "none":
      return "Pendente";
  }
}

export function mappingStatusLabel(status: JiraCatalogRowStatus): string {
  return status === "mapped" ? "Mapeado" : "Pendente";
}
