"use client";

import Link from "next/link";
import { DataTable } from "@/components/surface";
import { InlineActions } from "@/components/ui/destructive-action";
import {
  FormActions,
  FormCheck,
  FormFeedback,
  FormField,
  FormSectionHeader,
} from "@/components/ui/form";
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
      <div className="rounded-[var(--radius-sm)] border border-dashed border-border/80 bg-muted/30 px-4 py-3 sm:col-span-2 lg:col-span-4">
        <p className="text-sm font-medium">Integração Jira</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Este time ainda não tem integração vinculada. Prefixo de routing:{" "}
          <span className="font-medium text-foreground">
            {team.jira_key_prefix}-…
          </span>
          .
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Credenciais, projetos, sync e analytics são gerenciados na aba Jira.
        </p>
        <Link
          href="/app/jira"
          className="ui-btn-secondary mt-3 inline-flex"
        >
          Configurar na aba Jira
        </Link>
      </div>
    );
  }

  const projects =
    link.projectKeys.length > 0 ? link.projectKeys.join(", ") : "todos (sem filtro)";

  return (
    <div className="rounded-[var(--radius-sm)] border border-border/80 bg-muted/20 px-4 py-3 sm:col-span-2 lg:col-span-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Integração Jira (somente leitura)</p>
          <p className="text-sm text-muted-foreground">
            Vinculado a{" "}
            <span className="font-medium text-foreground">{link.name}</span>
            {" · "}
            {link.isEnabled ? "habilitada" : "desabilitada"}
            {" · "}
            projetos: <span className="font-medium text-foreground">{projects}</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Prefixo do time: {team.jira_key_prefix}-… · {link.baseUrl}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Para editar conexão, filtros, mapeamentos ou histórico, use a aba
            Jira.
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

  return (
    <div className="space-y-6">
      <div className="rounded-[var(--radius-sm)] border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        As configurações da integração Jira (credenciais, sync, mapping,
        analytics) ficam na aba{" "}
        <Link href="/app/jira" className="font-medium text-foreground underline-offset-2 hover:underline">
          Jira
        </Link>
        . Aqui você organiza o time e o prefixo usado nos imports.
      </div>

      <form
        action={createAction}
        className="ui-card grid gap-4 border-dashed p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="sm:col-span-2 lg:col-span-4">
          <FormSectionHeader
            title="Novo time"
            description="Estrutura organizacional. Depois vincule a integração na aba Jira."
          />
        </div>
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
      <FormFeedback error={createState.error} success={createState.success} />

      {editing ? (
        <form
          action={updateAction}
          className="ui-card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <input type="hidden" name="teamId" value={editing.id} />
          <p className="text-sm font-medium sm:col-span-2 lg:col-span-4">
            Editando: {editing.name}
          </p>
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
      ) : null}
      <FormFeedback error={updateState.error} success={updateState.success} />
      <FormFeedback error={toggleState.error} success={toggleState.success} />

      <DataTable minWidthClassName="min-w-[720px]">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Código</th>
            <th>Prefixo</th>
            <th>Status</th>
            <th>Jira</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => {
            const link = jiraByTeamId[team.id];
            return (
              <tr
                key={team.id}
                className={!team.is_active ? "opacity-60" : undefined}
              >
                <td className="font-medium">{team.name}</td>
                <td>{team.code}</td>
                <td>{team.jira_key_prefix}-…</td>
                <td>{team.is_active ? "Ativo" : "Inativo"}</td>
                <td className="text-muted-foreground">
                  {link ? (
                    <Link
                      href={`/app/jira?integrationId=${link.integrationId}`}
                      className="text-foreground underline-offset-2 hover:underline"
                    >
                      {link.isEnabled ? "conectada" : "desabilitada"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <InlineActions>
                    <button
                      type="button"
                      onClick={() => setEditingId(team.id)}
                      className="ui-btn-ghost"
                    >
                      Editar
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
    </div>
  );
}
