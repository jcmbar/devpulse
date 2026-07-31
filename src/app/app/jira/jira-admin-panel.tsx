"use client";

import Link from "next/link";
import { DataTable } from "@/components/surface";
import { JiraTeamContextSelect } from "@/app/app/jira/jira-team-context-select";
import { JiraSyncPipelinePanel } from "@/app/app/jira/jira-sync-pipeline-panel";
import { JiraFieldMappingCatalogPanel } from "@/app/app/jira/jira-field-mapping-catalog";
import {
  FormActions,
  FormCheck,
  FormFeedback,
  FormField,
  FormSectionHeader,
} from "@/components/ui/form";
import {
  getJiraMappingReadiness,
  resolveJiraFieldMappings,
  type JiraMappingReadiness,
} from "@/lib/jira/field-mappings";
import { useActionState, useCallback, useMemo, useState } from "react";
import {
  saveJiraIntegrationAction,
  testJiraConnectionAction,
  type JiraFormState,
} from "@/app/app/jira/actions";
import type {
  JiraIntegration,
  JiraIssue,
  JiraProject,
  JiraSyncRun,
} from "@/types/jira-integration";
import type { JiraIssueFlowMetrics } from "@/types/jira-flow-analytics";
import type { Team } from "@/types/team";

const initialState: JiraFormState = { error: null, success: null };

function formatDurationMs(ms: number | null): string {
  if (ms == null) {
    return "—";
  }
  const days = ms / (1000 * 60 * 60 * 24);
  if (days >= 1) {
    return `${days.toFixed(1)}d`;
  }
  const hours = ms / (1000 * 60 * 60);
  return `${hours.toFixed(1)}h`;
}

type JiraAdminPanelProps = {
  teams: Team[];
  integrations: JiraIntegration[];
  selectedTeam: Team | null;
  selected: JiraIntegration | null;
  hasDuplicateIntegrations: boolean;
  saved: boolean;
  projects: JiraProject[];
  issueCount: number;
  sampleIssues: JiraIssue[];
  recentRuns: JiraSyncRun[];
  flowMetricsCount: number;
  sampleFlowMetrics: JiraIssueFlowMetrics[];
  issueKeyById: Record<string, string>;
};

export function JiraAdminPanel({
  teams,
  integrations,
  selectedTeam,
  selected,
  hasDuplicateIntegrations,
  saved,
  projects,
  issueCount,
  sampleIssues,
  recentRuns,
  flowMetricsCount,
  sampleFlowMetrics,
  issueKeyById,
}: JiraAdminPanelProps) {
  const [saveState, saveAction, savePending] = useActionState(
    saveJiraIntegrationAction,
    initialState,
  );
  const [testState, testAction, testPending] = useActionState(
    testJiraConnectionAction,
    initialState,
  );

  const initialReadiness = useMemo((): JiraMappingReadiness => {
    if (!selected) {
      return { ready: false, pendingKeys: [], pendingLabels: [] };
    }
    const preferredKey = selectedTeam?.jira_key_prefix?.trim().toUpperCase();
    const preferredProject =
      (preferredKey
        ? projects.find((project) => project.key.toUpperCase() === preferredKey)
        : null) ??
      projects[0] ??
      null;
    const effective = resolveJiraFieldMappings({
      projectKey: preferredProject?.key ?? null,
      projectMappings: preferredProject?.field_mappings ?? null,
      integrationMappings: selected.field_mappings,
    }).mappings;
    return getJiraMappingReadiness(effective);
  }, [selected, selectedTeam, projects]);

  const readinessScopeKey = `${selected?.id ?? "none"}:${selectedTeam?.id ?? "none"}`;
  const [liveReadiness, setLiveReadiness] = useState<{
    scopeKey: string;
    value: JiraMappingReadiness;
  } | null>(null);

  const mappingReadiness =
    liveReadiness?.scopeKey === readinessScopeKey
      ? liveReadiness.value
      : initialReadiness;

  const onReadinessChange = useCallback(
    (next: JiraMappingReadiness) => {
      setLiveReadiness({ scopeKey: readinessScopeKey, value: next });
    },
    [readinessScopeKey],
  );

  if (!selectedTeam) {
    return (
      <div className="ui-card p-5 text-sm text-muted-foreground">
        Cadastre um time antes de configurar a integração Jira.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="ui-card space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-4 rounded-[var(--radius-sm)] border border-border/70 bg-muted/20 p-3">
          <div className="space-y-1">
            <label
              htmlFor="jira-team-context"
              className="ui-label"
            >
              Time em contexto
            </label>
            <JiraTeamContextSelect
              teams={teams}
              value={selectedTeam.id}
            />
          </div>
          <div className="text-right">
            <p className="text-sm font-medium">{selectedTeam.name}</p>
            <p className="text-xs text-muted-foreground">
              {selected
                ? `Integração salva · ${selected.name}`
                : "Sem integração salva · modo de criação"}
            </p>
          </div>
        </div>

        {hasDuplicateIntegrations ? (
          <div className="ui-alert-error">
            Há mais de uma integração vinculada a este time. A tela carregou a
            mais recente; corrija os dados antes de operar. O schema atual
            exige uma integração por time.
          </div>
        ) : null}

        <FormSectionHeader
          title={
            selected
              ? `Editar integração · ${selectedTeam.name}`
              : `Criar integração · ${selectedTeam.name}`
          }
          description={
            selected
              ? "Os campos e operações abaixo pertencem exclusivamente ao time em contexto."
              : "Este time ainda não possui integração. Salve a configuração antes de executar operações."
          }
        />

        <form action={saveAction} className="space-y-5">
          <input type="hidden" name="teamId" value={selectedTeam.id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Nome" htmlFor="name">
              <input
                id="name"
                name="name"
                required
                defaultValue={
                  selected?.name ??
                  `Jira · ${selectedTeam.name}`
                }
                className="ui-input"
              />
            </FormField>
            <FormField
              label="Base URL"
              htmlFor="baseUrl"
              hint="Ex.: https://sua-empresa.atlassian.net"
            >
              <input
                id="baseUrl"
                name="baseUrl"
                type="url"
                required
                defaultValue={selected?.base_url ?? ""}
                placeholder="https://empresa.atlassian.net"
                className="ui-input"
              />
            </FormField>
            <FormField label="E-mail da conta API" htmlFor="email">
              <input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={selected?.email ?? ""}
                className="ui-input"
              />
            </FormField>
            <FormField
              label="Secret ref (env)"
              htmlFor="apiTokenSecretRef"
              hint="Nome da variável, nunca o token. Ex.: JIRA_TOKEN_PRIME"
            >
              <input
                id="apiTokenSecretRef"
                name="apiTokenSecretRef"
                required
                defaultValue={selected?.api_token_secret_ref ?? ""}
                placeholder="JIRA_TOKEN_PRIME"
                className="ui-input"
              />
            </FormField>
            <FormField
              label="Project keys"
              htmlFor="projectKeys"
              hint="Separados por vírgula. Vazio = todos os projetos visíveis (cuidado com volume). Seed sugerido = prefixo do time."
            >
              <input
                id="projectKeys"
                name="projectKeys"
                defaultValue={
                  selected?.project_keys?.join(", ") ??
                  selectedTeam.jira_key_prefix ??
                  ""
                }
                placeholder="AP, PE"
                className="ui-input"
              />
            </FormField>
            <FormField
              label="Janela inicial (dias)"
              htmlFor="syncWindowDays"
              hint="Usada no primeiro sync (full)."
            >
              <input
                id="syncWindowDays"
                name="syncWindowDays"
                type="number"
                min={1}
                max={730}
                defaultValue={selected?.sync_window_days ?? 90}
                className="ui-input"
              />
            </FormField>
            <FormField
              label="Overlap de segurança (min)"
              htmlFor="safetyOverlapMinutes"
            >
              <input
                id="safetyOverlapMinutes"
                name="safetyOverlapMinutes"
                type="number"
                min={0}
                max={1440}
                defaultValue={selected?.safety_overlap_minutes ?? 15}
                className="ui-input"
              />
            </FormField>
            <FormField
              label="JQL extra (AND) — opcional"
              htmlFor="jqlExtra"
              className="sm:col-span-2"
              hint={
                selected?.jql_extra?.trim()
                  ? `Valor salvo: ${selected.jql_extra.trim()}. Apague o campo e salve para remover o filtro. Não inclua ORDER BY.`
                  : "Opcional. Deixe vazio para sync sem filtro adicional. Não inclua ORDER BY. Ex.: statusCategory != Done"
              }
            >
              <input
                id="jqlExtra"
                name="jqlExtra"
                defaultValue={selected?.jql_extra ?? ""}
                placeholder="(vazio = sem filtro extra)"
                className="ui-input"
                autoComplete="off"
              />
            </FormField>
          </div>

          <div className="flex flex-wrap gap-4">
            <FormCheck>
              <input
                type="checkbox"
                name="isEnabled"
                defaultChecked={selected?.is_enabled ?? false}
                className="ui-checkbox mt-0.5"
              />
              <span>Integração habilitada</span>
            </FormCheck>
            <FormCheck>
              <input
                type="checkbox"
                name="includeChangelog"
                defaultChecked={selected?.include_changelog ?? true}
                className="ui-checkbox mt-0.5"
              />
              <span>Coletar changelog (status/assignee)</span>
            </FormCheck>
            <FormCheck>
              <input
                type="checkbox"
                name="includeWorklogs"
                defaultChecked={selected?.include_worklogs ?? true}
                className="ui-checkbox mt-0.5"
              />
              <span>Coletar worklogs</span>
            </FormCheck>
          </div>

          <FormFeedback
            error={saveState.error}
            success={
              saveState.success ??
              (saved
                ? `Integração de ${selectedTeam.name} salva.`
                : null)
            }
          />
          <FormActions
            primary={{
              label: "Salvar integração",
              loadingLabel: "Salvando...",
              pending: savePending,
            }}
          />
        </form>
      </section>

      {selected && selectedTeam ? (
        <JiraFieldMappingCatalogPanel
          key={`catalog:${selected.id}:${selectedTeam.id}`}
          integration={selected}
          teamId={selectedTeam.id}
          teamName={selectedTeam.name}
          teamJiraKeyPrefix={selectedTeam.jira_key_prefix}
          projects={projects}
          onReadinessChange={onReadinessChange}
        />
      ) : null}

      {integrations.length > 0 ? (
        <section className="space-y-3">
          <FormSectionHeader
            title="Integrações"
            description={`${integrations.length} configurada(s).`}
          />
          <DataTable minWidthClassName="min-w-[720px]">
            <thead>
              <tr>
                <th>Time</th>
                <th>Nome</th>
                <th>Projetos</th>
                <th>Status</th>
                <th>Cursor</th>
                <th>Último sync OK</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((row) => {
                const team = teams.find((item) => item.id === row.team_id);
                const isCurrent = row.id === selected?.id;
                return (
                <tr
                  key={row.id}
                  className={isCurrent ? "bg-brand-soft/50" : undefined}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <td>{team?.name ?? row.team_id.slice(0, 8)}</td>
                  <td className="font-medium">{row.name}</td>
                  <td className="text-muted-foreground">
                    {row.project_keys.length
                      ? row.project_keys.join(", ")
                      : "todos"}
                  </td>
                  <td>{row.is_enabled ? "habilitada" : "off"}</td>
                  <td className="text-muted-foreground whitespace-nowrap">
                    {row.sync_cursor_updated_at ?? "—"}
                  </td>
                  <td className="text-muted-foreground whitespace-nowrap">
                    {row.last_successful_sync_at ?? "—"}
                  </td>
                  <td>
                    <Link
                      href={`/app/jira?teamId=${row.team_id}`}
                      className="ui-btn-ghost"
                    >
                      {isCurrent ? "Em edição" : "Editar"}
                    </Link>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </DataTable>
        </section>
      ) : null}

      {selected ? (
        <section className="ui-card space-y-5 p-4 sm:p-5">
          <form action={testAction} className="space-y-3">
            <input type="hidden" name="integrationId" value={selected.id} />
            <input type="hidden" name="teamId" value={selectedTeam.id} />
            <FormFeedback error={testState.error} success={testState.success} />
            <FormActions
              primary={{
                label: "Testar conexão",
                loadingLabel: "Testando...",
                pending: testPending,
              }}
            />
          </form>

          <div className="border-t border-border/60 pt-4">
            <JiraSyncPipelinePanel
              integrationId={selected.id}
              teamId={selectedTeam.id}
              enabled={selected.is_enabled}
              mappingReady={mappingReadiness.ready}
              mappingPendingLabels={mappingReadiness.pendingLabels}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Issues locais: {issueCount} · Projetos sync: {projects.length} ·
            snapshots flow_v1: {flowMetricsCount}
          </p>
        </section>
      ) : (
        <section className="ui-card space-y-2 p-4 sm:p-5">
          <h2 className="ui-form-section-title">Operações</h2>
          <p className="text-sm text-muted-foreground">
            Salve primeiro a integração de {selectedTeam.name}. Depois você
            poderá testar a conexão e rodar o sync orquestrado.
          </p>
        </section>
      )}

      {recentRuns.length > 0 ? (
        <section className="space-y-3">
          <FormSectionHeader title="Últimas execuções" />
          <DataTable minWidthClassName="min-w-[800px]">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Modo</th>
                <th>Status</th>
                <th>Issues</th>
                <th>Reproc.</th>
                <th>Worklogs</th>
                <th>Stop</th>
                <th>API</th>
                <th>Erro</th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((run) => {
                const stopReason =
                  typeof run.metrics?.stop_reason === "string"
                    ? run.metrics.stop_reason
                    : "—";
                const reprocessed =
                  typeof run.metrics?.issues_reprocessed === "number"
                    ? run.metrics.issues_reprocessed
                    : "—";
                const worklogsFetched =
                  typeof run.metrics?.worklogs_fetched === "number"
                    ? run.metrics.worklogs_fetched
                    : run.worklogs_upserted;
                const changelogReqs =
                  typeof run.metrics?.changelog_issue_requests === "number"
                    ? run.metrics.changelog_issue_requests
                    : "—";
                return (
                  <tr key={run.id}>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {run.created_at}
                    </td>
                    <td>{run.mode}</td>
                    <td>{run.status}</td>
                    <td className="tabular-nums">
                      {run.issues_upserted}/{run.issues_fetched}
                    </td>
                    <td className="tabular-nums">{reprocessed}</td>
                    <td className="tabular-nums">
                      {worklogsFetched}
                      <span className="text-muted-foreground">
                        {" "}
                        / chg {changelogReqs}
                      </span>
                    </td>
                    <td className="max-w-[10rem] truncate text-muted-foreground">
                      {stopReason}
                    </td>
                    <td className="tabular-nums">{run.api_requests}</td>
                    <td className="max-w-xs truncate text-muted-foreground">
                      {run.error_message ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </section>
      ) : null}

      {sampleIssues.length > 0 ? (
        <section className="space-y-3">
          <FormSectionHeader
            title="Amostra de issues"
            description="Ordenadas por updated_at_jira (local normalizado)."
          />
          <DataTable minWidthClassName="min-w-[900px]">
            <thead>
              <tr>
                <th>Key</th>
                <th>Resumo</th>
                <th>Status</th>
                <th>Assignee</th>
                <th>Updated</th>
                <th>SP</th>
              </tr>
            </thead>
            <tbody>
              {sampleIssues.map((issue) => (
                <tr key={issue.id}>
                  <td className="font-medium whitespace-nowrap">
                    {issue.jira_key}
                  </td>
                  <td className="max-w-sm truncate">{issue.summary ?? "—"}</td>
                  <td>{issue.status ?? "—"}</td>
                  <td className="text-muted-foreground">
                    {issue.assignee_display_name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {issue.updated_at_jira ?? "—"}
                  </td>
                  <td className="tabular-nums">
                    {issue.story_points ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </section>
      ) : null}

      {sampleFlowMetrics.length > 0 ? (
        <section className="space-y-3">
          <FormSectionHeader
            title="Amostra de métricas de fluxo"
            description="Snapshots derivados (flow_v1). Lead time / aging / Develop / Staging / reopens."
          />
          <DataTable minWidthClassName="min-w-[960px]">
            <thead>
              <tr>
                <th>Key</th>
                <th>Lead</th>
                <th>Aging</th>
                <th>→ Develop</th>
                <th>→ Staging</th>
                <th>Reopen</th>
                <th>Dev reentry</th>
                <th>Assignee Δ</th>
                <th>Grupo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sampleFlowMetrics.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium whitespace-nowrap">
                    {issueKeyById[row.issue_id] ?? row.issue_id.slice(0, 8)}
                  </td>
                  <td className="tabular-nums">
                    {formatDurationMs(row.lead_time_ms)}
                  </td>
                  <td className="tabular-nums">
                    {formatDurationMs(row.aging_ms)}
                  </td>
                  <td className="tabular-nums">
                    {formatDurationMs(row.time_to_first_develop_ms)}
                  </td>
                  <td className="tabular-nums">
                    {formatDurationMs(row.time_to_first_staging_ms)}
                  </td>
                  <td className="tabular-nums">{row.reopen_count}</td>
                  <td className="tabular-nums">{row.develop_reentry_count}</td>
                  <td className="tabular-nums">{row.assignee_change_count}</td>
                  <td className="text-muted-foreground">
                    {row.current_status_group ?? "—"}
                  </td>
                  <td>
                    {selected ? (
                      <a
                        href={`/app/jira/analytics/issues/${row.issue_id}?integrationId=${selected.id}`}
                        className="ui-btn-ghost"
                      >
                        Auditar
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </section>
      ) : null}
    </div>
  );
}
