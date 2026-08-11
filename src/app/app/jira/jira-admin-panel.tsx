"use client";

import Link from "next/link";
import { DataTable } from "@/components/surface";
import { JiraTeamContextSelect } from "@/app/app/jira/jira-team-context-select";
import { JiraSyncPipelinePanel } from "@/app/app/jira/jira-sync-pipeline-panel";
import { JiraFieldMappingCatalogPanel } from "@/app/app/jira/jira-field-mapping-catalog";
import { KpiMetricCard } from "@/components/ui/kpi-metric-card";
import {
  ClientListPagination,
  useClientPagedItems,
} from "@/components/ui/client-list-pagination";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { FilterBar, SectionShell } from "@/components/ui/section-shell";
import {
  FormActions,
  FormCheck,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import {
  getJiraMappingReadiness,
  resolveJiraFieldMappings,
  type JiraMappingReadiness,
} from "@/lib/jira/field-mappings";
import { formatDateTimeShortBrazil } from "@/lib/datetime/format-brazil";
import { resolveJiraAutoSyncCooldownMinutes } from "@/services/integrations/jira/constants";
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
const TABLE_PAGE_SIZE = 8;

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
      <div className="ui-dashboard-panel text-sm text-muted-foreground">
        Cadastre um time antes de configurar a integração Jira.
      </div>
    );
  }

  const lastOkSync = selected?.last_successful_sync_at ?? null;

  return (
    <div className="space-y-5">
      <FilterBar>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="ui-filter-bar__field min-w-0 sm:max-w-sm">
            <p className="ui-filter-bar__label">Time em contexto</p>
            <JiraTeamContextSelect teams={teams} value={selectedTeam.id} />
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-medium text-foreground">{selectedTeam.name}</p>
            <p className="text-xs text-muted-foreground">
              {selected
                ? `Integração salva · ${selected.name}`
                : "Sem integração salva · modo de criação"}
              {selectedTeam.jira_key_prefix
                ? ` · prefixo ${selectedTeam.jira_key_prefix}`
                : ""}
            </p>
          </div>
        </div>
      </FilterBar>

      {hasDuplicateIntegrations ? (
        <div className="rounded-[var(--radius-sm)] border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-danger">
          Há mais de uma integração vinculada a este time. A tela carregou a
          mais recente; corrija os dados antes de operar. O schema atual exige
          uma integração por time.
        </div>
      ) : null}

      <CollapsibleSection
        title="Resumo do contexto"
        description="Indicadores locais do time selecionado (já sincronizados)."
        defaultOpen
      >
        <div className="ui-kpi-grid--hero">
          <KpiMetricCard
            variant="hero"
            label="Issues locais"
            value={String(issueCount)}
            tone="info"
          />
          <KpiMetricCard
            variant="hero"
            label="Projetos"
            value={String(projects.length)}
            tone="info"
          />
          <KpiMetricCard
            variant="hero"
            label="Snapshots flow"
            value={String(flowMetricsCount)}
            tone="brand"
            hint="flow_v1"
          />
          <KpiMetricCard
            variant="hero"
            label="Integração"
            value={
              !selected
                ? "Nova"
                : selected.is_enabled
                  ? "Habilitada"
                  : "Off"
            }
            tone={
              !selected
                ? "neutral"
                : selected.is_enabled
                  ? "success"
                  : "warning"
            }
            hint={
              mappingReadiness.ready
                ? "Mapeamento pronto"
                : "Mapeamento pendente"
            }
          />
          <KpiMetricCard
            variant="hero"
            label="Último sync OK"
            value={
              lastOkSync
                ? formatDateTimeShortBrazil(lastOkSync)
                : "—"
            }
            tone={lastOkSync ? "success" : "neutral"}
          />
        </div>
      </CollapsibleSection>

      <SectionShell
        title={
          selected
            ? `Configuração · ${selectedTeam.name}`
            : `Criar integração · ${selectedTeam.name}`
        }
        description={
          selected
            ? "Campos e credenciais exclusivos do time em contexto."
            : "Salve a configuração antes de testar conexão ou rodar o sync."
        }
      >
        <div className="ui-dashboard-panel">
          <form action={saveAction} className="space-y-5">
            <input type="hidden" name="teamId" value={selectedTeam.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Nome" htmlFor="name">
                <input
                  id="name"
                  name="name"
                  required
                  defaultValue={
                    selected?.name ?? `Jira · ${selectedTeam.name}`
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
                label="Intervalo entre syncs automáticas (min)"
                htmlFor="autoSyncCooldownMinutes"
                hint="Gestor e cron só disparam de novo após este intervalo. “Rodar Sync Agora” ignora. Padrão 60."
              >
                <input
                  id="autoSyncCooldownMinutes"
                  name="autoSyncCooldownMinutes"
                  type="number"
                  min={1}
                  max={1440}
                  defaultValue={resolveJiraAutoSyncCooldownMinutes(
                    selected?.settings ?? null,
                  )}
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
                (saved ? `Integração de ${selectedTeam.name} salva.` : null)
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
        </div>
      </SectionShell>

      {selected && selectedTeam ? (
        <CollapsibleSection
          title="Mapeamento de campos"
          description="Campos custom do Jira usados no Compilado e no fluxo."
          defaultOpen
        >
          <JiraFieldMappingCatalogPanel
            key={`catalog:${selected.id}:${selectedTeam.id}`}
            integration={selected}
            teamId={selectedTeam.id}
            teamName={selectedTeam.name}
            teamJiraKeyPrefix={selectedTeam.jira_key_prefix}
            projects={projects}
            onReadinessChange={onReadinessChange}
          />
        </CollapsibleSection>
      ) : null}

      <CollapsibleSection
        title="Operações"
        description={
          selected
            ? "Teste de conexão e pipeline de sync orquestrado."
            : `Salve primeiro a integração de ${selectedTeam.name}.`
        }
        defaultOpen
      >
        {selected ? (
          <div className="ui-dashboard-panel space-y-5">
            <form action={testAction} className="space-y-3">
              <input type="hidden" name="integrationId" value={selected.id} />
              <input type="hidden" name="teamId" value={selectedTeam.id} />
              <FormFeedback
                error={testState.error}
                success={testState.success}
              />
              <FormActions
                primary={{
                  label: "Testar conexão",
                  loadingLabel: "Testando...",
                  pending: testPending,
                }}
              />
            </form>

            <div className="border-t border-border/70 pt-4">
              <JiraSyncPipelinePanel
                integrationId={selected.id}
                teamId={selectedTeam.id}
                enabled={selected.is_enabled}
                mappingReady={mappingReadiness.ready}
                mappingPendingLabels={mappingReadiness.pendingLabels}
              />
            </div>
          </div>
        ) : (
          <div className="ui-dashboard-panel text-sm text-muted-foreground">
            Depois de salvar, você poderá testar a conexão e rodar o sync
            orquestrado.
          </div>
        )}
      </CollapsibleSection>

      {integrations.length > 0 ? (
        <CollapsibleSection
          title="Integrações cadastradas"
          description={`${integrations.length} configurada(s) · troque o time no filtro acima para editar outra.`}
          defaultOpen={integrations.length <= TABLE_PAGE_SIZE}
        >
          <IntegrationsTable
            integrations={integrations}
            teams={teams}
            selectedId={selected?.id ?? null}
          />
        </CollapsibleSection>
      ) : null}

      {recentRuns.length > 0 ? (
        <CollapsibleSection
          title="Últimas execuções"
          description="Histórico recente de sync em todos os times/Jiras."
          defaultOpen
        >
          <RecentRunsTable
            recentRuns={recentRuns}
            integrations={integrations}
            teams={teams}
          />
        </CollapsibleSection>
      ) : null}

      {sampleIssues.length > 0 || sampleFlowMetrics.length > 0 ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {sampleIssues.length > 0 ? (
            <CollapsibleSection
              title="Amostra de issues"
              description="Ordenadas por updated_at_jira (local)."
              defaultOpen
            >
              <SampleIssuesTable sampleIssues={sampleIssues} />
            </CollapsibleSection>
          ) : null}

          {sampleFlowMetrics.length > 0 ? (
            <CollapsibleSection
              title="Amostra de fluxo"
              description="Snapshots flow_v1 · lead / aging / reopens."
              defaultOpen
            >
              <SampleFlowTable
                sampleFlowMetrics={sampleFlowMetrics}
                issueKeyById={issueKeyById}
                selectedId={selected?.id ?? null}
              />
            </CollapsibleSection>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IntegrationsTable({
  integrations,
  teams,
  selectedId,
}: {
  integrations: JiraIntegration[];
  teams: Team[];
  selectedId: string | null;
}) {
  const page = useClientPagedItems(integrations, TABLE_PAGE_SIZE);

  return (
    <>
      <DataTable minWidthClassName="min-w-[720px]" stickyFirstColumn>
        <thead>
          <tr>
            <th>Time</th>
            <th>Nome</th>
            <th className="hidden sm:table-cell">Projetos</th>
            <th>Status</th>
            <th className="hidden md:table-cell">Último sync OK</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {page.items.map((row) => {
            const team = teams.find((item) => item.id === row.team_id);
            const isCurrent = row.id === selectedId;
            return (
              <tr
                key={row.id}
                className={isCurrent ? "bg-brand-soft/50" : undefined}
                aria-current={isCurrent ? "true" : undefined}
              >
                <td className="font-medium">
                  {team?.name ?? row.team_id.slice(0, 8)}
                </td>
                <td>{row.name}</td>
                <td className="hidden text-muted-foreground sm:table-cell">
                  {row.project_keys.length
                    ? row.project_keys.join(", ")
                    : "todos"}
                </td>
                <td>{row.is_enabled ? "Habilitada" : "Off"}</td>
                <td className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                  {row.last_successful_sync_at ?? "—"}
                </td>
                <td className="text-right">
                  <Link
                    href={`/app/jira?teamId=${row.team_id}`}
                    className="ui-btn-ghost"
                  >
                    {isCurrent ? "Em edição" : "Abrir"}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <ClientListPagination
        page={page.page}
        totalPages={page.totalPages}
        total={page.total}
        pageSize={page.pageSize}
        onPageChange={page.setPage}
      />
    </>
  );
}

function RecentRunsTable({
  recentRuns,
  integrations,
  teams,
}: {
  recentRuns: JiraSyncRun[];
  integrations: JiraIntegration[];
  teams: Team[];
}) {
  const page = useClientPagedItems(recentRuns, TABLE_PAGE_SIZE);
  const integrationById = useMemo(
    () => new Map(integrations.map((row) => [row.id, row])),
    [integrations],
  );
  const teamById = useMemo(
    () => new Map(teams.map((row) => [row.id, row])),
    [teams],
  );

  return (
    <>
      <DataTable minWidthClassName="min-w-[920px]">
        <thead>
          <tr>
            <th>Time / Jira</th>
            <th>Quando</th>
            <th>Modo</th>
            <th>Status</th>
            <th>Issues</th>
            <th className="hidden sm:table-cell">Reproc.</th>
            <th className="hidden md:table-cell">Worklogs</th>
            <th className="hidden lg:table-cell">Stop</th>
            <th className="hidden md:table-cell">API</th>
            <th>Erro</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((run) => {
            const integration = integrationById.get(run.integration_id);
            const team = integration
              ? teamById.get(integration.team_id)
              : undefined;
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
                <td className="min-w-[10rem]">
                  <div className="font-medium">
                    {team?.name ?? "Time removido"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {integration?.name ?? run.integration_id.slice(0, 8)}
                    {integration?.project_keys?.length
                      ? ` · ${integration.project_keys.join(", ")}`
                      : ""}
                  </div>
                </td>
                <td className="whitespace-nowrap text-muted-foreground">
                  {run.created_at}
                </td>
                <td>{run.mode}</td>
                <td>{run.status}</td>
                <td className="tabular-nums">
                  {run.issues_upserted}/{run.issues_fetched}
                </td>
                <td className="hidden tabular-nums sm:table-cell">
                  {reprocessed}
                </td>
                <td className="hidden tabular-nums md:table-cell">
                  {worklogsFetched}
                  <span className="text-muted-foreground">
                    {" "}
                    / chg {changelogReqs}
                  </span>
                </td>
                <td className="hidden max-w-[10rem] truncate text-muted-foreground lg:table-cell">
                  {stopReason}
                </td>
                <td className="hidden tabular-nums md:table-cell">
                  {run.api_requests}
                </td>
                <td className="max-w-xs truncate text-muted-foreground">
                  {run.error_message ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <ClientListPagination
        page={page.page}
        totalPages={page.totalPages}
        total={page.total}
        pageSize={page.pageSize}
        onPageChange={page.setPage}
      />
    </>
  );
}

function SampleIssuesTable({ sampleIssues }: { sampleIssues: JiraIssue[] }) {
  const page = useClientPagedItems(sampleIssues, TABLE_PAGE_SIZE);

  return (
    <>
      <DataTable minWidthClassName="min-w-[520px]">
        <thead>
          <tr>
            <th>Key</th>
            <th>Resumo</th>
            <th className="hidden sm:table-cell">Status</th>
            <th className="hidden md:table-cell">Updated</th>
          </tr>
        </thead>
        <tbody>
          {page.items.map((issue) => (
            <tr key={issue.id}>
              <td className="font-medium whitespace-nowrap">
                {issue.jira_key}
              </td>
              <td className="max-w-[12rem] truncate">
                {issue.summary ?? "—"}
              </td>
              <td className="hidden sm:table-cell">{issue.status ?? "—"}</td>
              <td className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                {issue.updated_at_jira ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <ClientListPagination
        page={page.page}
        totalPages={page.totalPages}
        total={page.total}
        pageSize={page.pageSize}
        onPageChange={page.setPage}
      />
    </>
  );
}

function SampleFlowTable({
  sampleFlowMetrics,
  issueKeyById,
  selectedId,
}: {
  sampleFlowMetrics: JiraIssueFlowMetrics[];
  issueKeyById: Record<string, string>;
  selectedId: string | null;
}) {
  const page = useClientPagedItems(sampleFlowMetrics, TABLE_PAGE_SIZE);

  return (
    <>
      <DataTable minWidthClassName="min-w-[520px]">
        <thead>
          <tr>
            <th>Key</th>
            <th>Lead</th>
            <th>Aging</th>
            <th className="hidden sm:table-cell">Reopen</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {page.items.map((row) => (
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
              <td className="hidden tabular-nums sm:table-cell">
                {row.reopen_count}
              </td>
              <td className="text-right">
                {selectedId ? (
                  <Link
                    href={`/app/jira/analytics/issues/${row.issue_id}?integrationId=${selectedId}`}
                    className="ui-btn-ghost"
                  >
                    Auditar
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <ClientListPagination
        page={page.page}
        totalPages={page.totalPages}
        total={page.total}
        pageSize={page.pageSize}
        onPageChange={page.setPage}
      />
    </>
  );
}
