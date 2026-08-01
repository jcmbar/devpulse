"use client";

import Link from "next/link";
import { DataTable } from "@/components/surface";
import { KpiMetricCard } from "@/components/ui/kpi-metric-card";
import { InlineActions } from "@/components/ui/destructive-action";
import {
  FormActions,
  FormCheck,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import { SectionShell } from "@/components/ui/section-shell";
import { useActionState, useState } from "react";
import {
  createTeamAction,
  toggleTeamActiveAction,
  updateTeamAction,
  type TeamFormState,
} from "@/app/app/teams/actions";
import type { Team, TeamJiraIntegrationSummary } from "@/types/team";

const initialState: TeamFormState = { error: null, success: null };

function TeamFields({
  team,
  idPrefix,
}: {
  team?: Team;
  idPrefix: string;
}) {
  return (
    <>
      <FormField label="Nome" htmlFor={`${idPrefix}-name`}>
        <input
          id={`${idPrefix}-name`}
          name="name"
          required
          defaultValue={team?.name ?? ""}
          className="ui-input"
        />
      </FormField>
      <FormField
        label="Código (slug)"
        htmlFor={`${idPrefix}-code`}
        hint="Identificador estável do time. Developers e imports vinculam por `team_id`."
      >
        <input
          id={`${idPrefix}-code`}
          name="code"
          required
          defaultValue={team?.code ?? ""}
          placeholder="PRIME"
          className="ui-input"
        />
      </FormField>
      <FormField
        label="Prefixo Jira"
        htmlFor={`${idPrefix}-jiraKeyPrefix`}
        hint="Routing de imports (ex.: AP-123 → time AP). Credenciais e sync ficam na aba Jira."
      >
        <input
          id={`${idPrefix}-jiraKeyPrefix`}
          name="jiraKeyPrefix"
          required
          defaultValue={team?.jira_key_prefix ?? ""}
          placeholder="AP"
          className="ui-input"
        />
      </FormField>
      <FormCheck>
        <input
          name="isActive"
          type="checkbox"
          defaultChecked={team?.is_active ?? true}
          className="ui-checkbox mt-0.5"
        />
        <span>Ativo</span>
      </FormCheck>
      <FormField
        label="Notas"
        htmlFor={`${idPrefix}-notes`}
        className="sm:col-span-2 lg:col-span-4"
      >
        <input
          id={`${idPrefix}-notes`}
          name="notes"
          defaultValue={team?.notes ?? ""}
          className="ui-input"
        />
      </FormField>
    </>
  );
}

function TeamJiraSummaryCard({
  team,
  link,
}: {
  team: Team;
  link: TeamJiraIntegrationSummary | null;
}) {
  if (!link) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-dashed border-border bg-muted/30 px-3 py-3 sm:col-span-2 lg:col-span-4">
        <p className="text-sm font-medium text-foreground">Integração Jira</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Este time ainda não tem integração vinculada. Prefixo de routing:{" "}
          <span className="font-medium text-foreground">
            {team.jira_key_prefix}-…
          </span>
          .
        </p>
        <Link href="/app/jira" className="ui-btn-secondary mt-3 inline-flex">
          Configurar na aba Jira
        </Link>
      </div>
    );
  }

  const projects =
    link.projectKeys.length > 0
      ? link.projectKeys.join(", ")
      : "todos (sem filtro)";

  return (
    <div className="rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-3 sm:col-span-2 lg:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            Integração Jira (somente leitura)
          </p>
          <p className="text-sm text-muted-foreground">
            Vinculado a{" "}
            <span className="font-medium text-foreground">{link.name}</span>
            {" · "}
            {link.isEnabled ? "habilitada" : "desabilitada"}
            {" · "}
            projetos:{" "}
            <span className="font-medium text-foreground">{projects}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Prefixo: {team.jira_key_prefix}-… · {link.baseUrl}
          </p>
        </div>
        <Link
          href={`/app/jira?integrationId=${link.integrationId}`}
          className="ui-btn-secondary shrink-0"
        >
          Gerenciar no Jira
        </Link>
      </div>
    </div>
  );
}

type TeamsAdminPanelProps = {
  teams: Team[];
  jiraByTeamId: Record<string, TeamJiraIntegrationSummary>;
};

export function TeamsAdminPanel({ teams, jiraByTeamId }: TeamsAdminPanelProps) {
  const [createState, createAction, createPending] = useActionState(
    createTeamAction,
    initialState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateTeamAction,
    initialState,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleTeamActiveAction,
    initialState,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = teams.find((row) => row.id === editingId) ?? null;

  const activeCount = teams.filter((team) => team.is_active).length;
  const inactiveCount = teams.length - activeCount;
  const withJiraCount = teams.filter((team) => jiraByTeamId[team.id]).length;
  const withoutJiraCount = teams.length - withJiraCount;

  return (
    <div className="space-y-5">
      <SectionShell
        title="Resumo"
        description="Visão rápida do cadastro organizacional."
      >
        <div className="ui-kpi-grid--hero">
          <KpiMetricCard
            variant="hero"
            label="Times"
            value={String(teams.length)}
            tone="info"
          />
          <KpiMetricCard
            variant="hero"
            label="Ativos"
            value={String(activeCount)}
            tone="success"
          />
          <KpiMetricCard
            variant="hero"
            label="Inativos"
            value={String(inactiveCount)}
            tone={inactiveCount > 0 ? "warning" : "neutral"}
          />
          <KpiMetricCard
            variant="hero"
            label="Com Jira"
            value={String(withJiraCount)}
            tone="brand"
            hint={`${withoutJiraCount} sem integração`}
          />
        </div>
      </SectionShell>

      <div className="rounded-[var(--radius-sm)] border border-border bg-card px-3.5 py-3 text-sm text-muted-foreground shadow-[var(--shadow-sm)]">
        Credenciais, sync, mapping e analytics ficam na aba{" "}
        <Link
          href="/app/jira"
          className="font-medium text-foreground underline-offset-2 hover:underline"
        >
          Jira
        </Link>
        . Aqui você organiza o time e o prefixo usado nos imports.
      </div>

      <SectionShell
        title="Novo time"
        description="Crie a estrutura organizacional. Depois vincule a integração na aba Jira."
      >
        <form
          action={createAction}
          className="ui-dashboard-panel grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <TeamFields idPrefix="create" />
          <div className="sm:col-span-2 lg:col-span-4">
            <FormActions
              primary={{
                label: "Criar time",
                loadingLabel: "Salvando...",
                pending: createPending,
              }}
            />
          </div>
        </form>
        <div className="mt-3">
          <FormFeedback
            error={createState.error}
            success={createState.success}
          />
        </div>
      </SectionShell>

      {editing ? (
        <SectionShell
          title={`Editando · ${editing.name}`}
          description="Altere dados do time. Integração Jira permanece somente leitura aqui."
          actions={
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="ui-btn-ghost"
            >
              Fechar edição
            </button>
          }
        >
          <form
            action={updateAction}
            className="ui-dashboard-panel grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <input type="hidden" name="teamId" value={editing.id} />
            <TeamFields key={editing.id} team={editing} idPrefix="edit" />
            <TeamJiraSummaryCard
              team={editing}
              link={jiraByTeamId[editing.id] ?? null}
            />
            <div className="sm:col-span-2 lg:col-span-4">
              <FormActions
                primary={{
                  label: "Salvar",
                  loadingLabel: "Salvando...",
                  pending: updatePending,
                }}
                secondary={{
                  label: "Cancelar",
                  onClick: () => setEditingId(null),
                }}
              />
            </div>
          </form>
          <div className="mt-3 space-y-2">
            <FormFeedback
              error={updateState.error}
              success={updateState.success}
            />
          </div>
        </SectionShell>
      ) : null}

      <FormFeedback error={toggleState.error} success={toggleState.success} />

      <SectionShell
        title="Lista de times"
        description={`${teams.length} time(s) · clique em Editar para alterar dados e ver o vínculo Jira.`}
      >
        <DataTable minWidthClassName="min-w-0 md:min-w-[720px]" stickyFirstColumn>
          <thead>
            <tr>
              <th>Time</th>
              <th className="hidden sm:table-cell">Código</th>
              <th>Prefixo</th>
              <th>Status</th>
              <th className="hidden md:table-cell">Jira</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {teams.map((team) => {
              const link = jiraByTeamId[team.id];
              const isEditing = editingId === team.id;
              return (
                <tr
                  key={team.id}
                  className={
                    !team.is_active
                      ? "opacity-60"
                      : isEditing
                        ? "bg-brand-soft/40"
                        : undefined
                  }
                >
                  <td>
                    <div className="min-w-[8rem]">
                      <p className="font-medium text-foreground">{team.name}</p>
                      {team.notes ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {team.notes}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground sm:hidden">
                          {team.code}
                        </p>
                      )}
                    </div>
                  </td>
                  <td className="hidden sm:table-cell">{team.code}</td>
                  <td className="whitespace-nowrap tabular-nums">
                    {team.jira_key_prefix}-…
                  </td>
                  <td>{team.is_active ? "Ativo" : "Inativo"}</td>
                  <td className="hidden md:table-cell">
                    {link ? (
                      <Link
                        href={`/app/jira?integrationId=${link.integrationId}`}
                        className="text-sm font-medium text-foreground underline-offset-2 hover:underline"
                      >
                        {link.isEnabled ? "Conectada" : "Desabilitada"}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    <InlineActions>
                      <button
                        type="button"
                        onClick={() => setEditingId(team.id)}
                        className="ui-btn-ghost"
                      >
                        {isEditing ? "Em edição" : "Editar"}
                      </button>
                      <form action={toggleAction}>
                        <input type="hidden" name="teamId" value={team.id} />
                        <input
                          type="hidden"
                          name="nextActive"
                          value={team.is_active ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          disabled={togglePending}
                          className="ui-btn-ghost"
                        >
                          {team.is_active ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                    </InlineActions>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </SectionShell>
    </div>
  );
}
