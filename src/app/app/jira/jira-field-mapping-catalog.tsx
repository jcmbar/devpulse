"use client";

import {
  listJiraFieldsAction,
  saveJiraScopeFieldMappingsAction,
  type JiraFieldOption,
  type JiraFormState,
} from "@/app/app/jira/actions";
import {
  FormActions,
  FormFeedback,
  FormSectionHeader,
} from "@/components/ui/form";
import {
  applyRecommendedJiraFieldMappings,
  DEVPULSE_JIRA_FIELD_CATALOG,
  getJiraMappingReadiness,
  JIRA_LOGICAL_FIELD_KEYS,
  mappingStatusLabel,
  resolveJiraFieldMappings,
  type JiraLogicalFieldKey,
  type JiraMappingReadiness,
} from "@/lib/jira/field-mappings";
import type {
  JiraFieldMappings,
  JiraIntegration,
  JiraProject,
} from "@/types/jira-integration";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

const initialState: JiraFormState = { error: null, success: null };

function emptyDraft(): Record<JiraLogicalFieldKey, string> {
  const draft = {} as Record<JiraLogicalFieldKey, string>;
  for (const key of JIRA_LOGICAL_FIELD_KEYS) {
    draft[key] = "";
  }
  return draft;
}

function draftFromMappings(
  mappings: JiraFieldMappings,
): Record<JiraLogicalFieldKey, string> {
  const next = emptyDraft();
  for (const key of JIRA_LOGICAL_FIELD_KEYS) {
    next[key] = mappings[key] ?? "";
  }
  return next;
}

function pickDefaultProjectId(
  projects: JiraProject[],
  preferredKey: string | null,
): string {
  if (projects.length === 0) {
    return "";
  }
  const needle = preferredKey?.trim().toUpperCase() ?? "";
  if (needle) {
    const match = projects.find((project) => project.key.toUpperCase() === needle);
    if (match) {
      return match.id;
    }
  }
  return projects[0]?.id ?? "";
}

function effectiveMappingsForScope(input: {
  integration: JiraIntegration;
  project: JiraProject | null;
}): JiraFieldMappings {
  return resolveJiraFieldMappings({
    projectKey: input.project?.key ?? null,
    projectMappings: input.project?.field_mappings ?? null,
    integrationMappings: input.integration.field_mappings,
  }).mappings;
}

type JiraFieldMappingCatalogPanelProps = {
  integration: JiraIntegration;
  teamId: string;
  teamName: string;
  teamJiraKeyPrefix?: string | null;
  projects: JiraProject[];
  onReadinessChange?: (readiness: JiraMappingReadiness) => void;
};

export function JiraFieldMappingCatalogPanel({
  integration,
  teamId,
  teamName,
  teamJiraKeyPrefix = null,
  projects,
  onReadinessChange,
}: JiraFieldMappingCatalogPanelProps) {
  const [fields, setFields] = useState<JiraFieldOption[]>([]);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [fieldsPending, startFieldsTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState(() =>
    pickDefaultProjectId(projects, teamJiraKeyPrefix ?? null),
  );

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;

  const [draft, setDraft] = useState<Record<JiraLogicalFieldKey, string>>(() =>
    draftFromMappings(
      effectiveMappingsForScope({
        integration,
        project:
          projects.find(
            (project) =>
              project.id ===
              pickDefaultProjectId(projects, teamJiraKeyPrefix ?? null),
          ) ?? null,
      }),
    ),
  );

  const [saveState, saveAction, savePending] = useActionState(
    saveJiraScopeFieldMappingsAction,
    initialState,
  );

  useEffect(() => {
    startFieldsTransition(async () => {
      setFieldsError(null);
      const result = await listJiraFieldsAction({
        integrationId: integration.id,
        teamId,
      });
      if (!result.ok) {
        setFieldsError(result.error);
        setFields([]);
        return;
      }
      setFields(result.fields);
    });
  }, [integration.id, teamId]);

  const readiness = useMemo(() => getJiraMappingReadiness(draft), [draft]);

  useEffect(() => {
    onReadinessChange?.(readiness);
  }, [readiness, onReadinessChange]);

  const filteredFields = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return fields.slice(0, 120);
    }
    return fields
      .filter(
        (field) =>
          field.name.toLowerCase().includes(needle) ||
          field.id.toLowerCase().includes(needle),
      )
      .slice(0, 120);
  }, [fields, query]);

  const scopeLabel = selectedProject
    ? `${selectedProject.key} · ${selectedProject.name}`
    : teamName;

  function loadScope(projectId: string) {
    setSelectedProjectId(projectId);
    const project = projects.find((row) => row.id === projectId) ?? null;
    setDraft(
      draftFromMappings(
        effectiveMappingsForScope({ integration, project }),
      ),
    );
  }

  function applyRecommendation(key: JiraLogicalFieldKey, recommended: string) {
    setDraft((prev) => ({ ...prev, [key]: recommended }));
  }

  function fillRecommendations() {
    const next = applyRecommendedJiraFieldMappings({
      current: draft,
      availableFieldIds: fields.map((field) => field.id),
      availableFields: fields,
    });
    setDraft(draftFromMappings(next));
  }

  function restoreBaseConfiguration() {
    setDraft(draftFromMappings(integration.field_mappings));
  }

  return (
    <section className="ui-card space-y-4 px-4 py-4">
      <FormSectionHeader
        title="De/para de campos"
        description={`Configuração do time ${teamName}${
          selectedProject ? ` · projeto Jira ${selectedProject.key}` : ""
        }. Um único catálogo, um único salvamento. Recomendado é só sugestão.`}
      />

      <div
        className={
          readiness.ready
            ? "rounded-md border border-emerald-300/60 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
            : "rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
        }
      >
        {readiness.ready ? (
          <p>De/para de {scopeLabel} pronto · sync liberada.</p>
        ) : (
          <p>
            {readiness.pendingKeys.length} obrigatório(s) pendente(s) em{" "}
            {scopeLabel} — sync bloqueada: {readiness.pendingLabels.join(", ")}.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.length > 0 ? (
          <label className="space-y-1.5 text-xs">
            <span className="font-semibold text-muted-foreground">
              Projeto Jira
            </span>
            <select
              className="ui-select"
              value={selectedProjectId}
              onChange={(event) => loadScope(event.target.value)}
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.key} — {project.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-1">
            Ainda sem projetos sincronizados. O de/para fica no time; após o
            primeiro sync, o projeto Jira aparece aqui.
          </p>
        )}
        <label className="space-y-1.5 text-xs">
          <span className="font-semibold text-muted-foreground">
            Buscar campos Jira
          </span>
          <input
            type="search"
            className="ui-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="summary, customfield_10053…"
          />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button
            type="button"
            className="ui-btn-secondary text-xs"
            onClick={fillRecommendations}
          >
            Usar recomendações
          </button>
          {selectedProject ? (
            <button
              type="button"
              className="ui-btn-ghost text-xs"
              onClick={restoreBaseConfiguration}
            >
              Restaurar base do time
            </button>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        “Usar recomendações” e “Restaurar sugestão” só alteram a tela até você
        salvar. Recomendado ≠ obrigatório.
      </p>

      {fieldsPending ? (
        <p className="text-xs text-muted-foreground">Carregando campos Jira…</p>
      ) : null}
      {fieldsError ? (
        <p className="text-sm text-danger">
          {fieldsError} Teste a conexão e recarregue.
        </p>
      ) : null}

      <FormFeedback error={saveState.error} success={saveState.success} />

      <form action={saveAction} className="space-y-4">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="integrationId" value={integration.id} />
        {selectedProject ? (
          <input type="hidden" name="projectId" value={selectedProject.id} />
        ) : null}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="ui-table min-w-[960px]">
            <thead>
              <tr>
                <th>Campo DevPulse</th>
                <th>Obrig.</th>
                <th>Campo Jira</th>
                <th>Recomendado</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {DEVPULSE_JIRA_FIELD_CATALOG.map((meta) => {
                const effectiveId = draft[meta.key] || "";
                const linkedId = meta.linkedToKey
                  ? draft[meta.linkedToKey] || ""
                  : effectiveId;
                const status = (meta.linkedToKey ? linkedId : effectiveId)
                  ? "mapped"
                  : "pending";
                const displayId = meta.linkedToKey ? linkedId : effectiveId;
                const fieldName =
                  fields.find((field) => field.id === displayId)?.name ?? null;
                const recommended = meta.recommendedJiraFieldId;
                const recommendedName = recommended
                  ? (fields.find((field) => field.id === recommended)?.name ??
                    recommended)
                  : null;

                if (meta.linkedToKey) {
                  return (
                    <tr key={meta.key}>
                      <td className="align-top">
                        <p className="font-medium">{meta.label}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {meta.key}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {meta.description}
                        </p>
                      </td>
                      <td className="align-top text-xs">
                        {meta.required ? "Sim" : "Não"}
                      </td>
                      <td className="align-top text-xs text-muted-foreground">
                        Derivado de{" "}
                        <span className="font-medium">{meta.linkedToKey}</span>
                        {displayId ? (
                          <span className="mt-1 block font-mono">
                            {fieldName ? `${fieldName} · ` : ""}
                            {displayId}
                          </span>
                        ) : null}
                      </td>
                      <td className="align-top text-xs text-muted-foreground">
                        —
                      </td>
                      <td className="align-top whitespace-nowrap text-xs">
                        <span
                          className={
                            status === "mapped"
                              ? "font-semibold text-emerald-700 dark:text-emerald-300"
                              : "font-semibold text-amber-800 dark:text-amber-200"
                          }
                        >
                          {mappingStatusLabel(status)}
                        </span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={meta.key}>
                    <td className="align-top">
                      <p className="font-medium">{meta.label}</p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {meta.key}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {meta.description}
                      </p>
                    </td>
                    <td className="align-top text-xs">
                      {meta.required ? "Sim" : "Não"}
                    </td>
                    <td className="align-top">
                      <select
                        className="ui-select min-w-[240px]"
                        name={`mapping_${meta.key}`}
                        value={draft[meta.key]}
                        onChange={(event) =>
                          setDraft((prev) => ({
                            ...prev,
                            [meta.key]: event.target.value,
                          }))
                        }
                      >
                        <option value="">— selecionar —</option>
                        {filteredFields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.name} · {field.id}
                            {field.custom ? " · custom" : ""}
                          </option>
                        ))}
                        {draft[meta.key] &&
                        !filteredFields.some(
                          (field) => field.id === draft[meta.key],
                        ) ? (
                          <option value={draft[meta.key]}>
                            {draft[meta.key]} (atual)
                          </option>
                        ) : null}
                      </select>
                    </td>
                    <td className="align-top text-xs">
                      {recommended ? (
                        <div className="space-y-1">
                          <p className="font-mono text-[11px]">
                            {recommendedName ?? recommended}
                          </p>
                          <button
                            type="button"
                            className="ui-btn-ghost text-[11px]"
                            onClick={() =>
                              applyRecommendation(meta.key, recommended)
                            }
                          >
                            Restaurar sugestão
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">
                          Sem sugestão automática
                        </span>
                      )}
                    </td>
                    <td className="align-top whitespace-nowrap text-xs">
                      <span
                        className={
                          status === "mapped"
                            ? "font-semibold text-emerald-700 dark:text-emerald-300"
                            : "font-semibold text-amber-800 dark:text-amber-200"
                        }
                      >
                        {mappingStatusLabel(status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <FormActions
          primary={{
            label: "Salvar de/para",
            loadingLabel: "Salvando...",
            pending: savePending,
          }}
        />
      </form>
    </section>
  );
}
