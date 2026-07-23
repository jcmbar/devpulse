"use client";

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
import type { Team } from "@/types/team";

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
        hint="Identificador estável do time (feriados / sync auxiliar). Developers e imports vinculam por `team_id`, não digitando este código."
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
        hint="Detectado em chaves como AP-123. Sem hardcode no código."
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

      <p className="ui-form-section-title sm:col-span-2 lg:col-span-4">
        Integração Jira (preparado — não conecta ainda)
      </p>
      <FormField
        label="Base URL"
        htmlFor={`${idPrefix}-jiraBaseUrl`}
        className="sm:col-span-2"
      >
        <input
          id={`${idPrefix}-jiraBaseUrl`}
          name="jiraBaseUrl"
          type="url"
          defaultValue={team?.jira_base_url ?? ""}
          placeholder="https://empresa.atlassian.net"
          className="ui-input"
        />
      </FormField>
      <FormField label="Project key API" htmlFor={`${idPrefix}-jiraProjectKey`}>
        <input
          id={`${idPrefix}-jiraProjectKey`}
          name="jiraProjectKey"
          defaultValue={team?.jira_project_key ?? ""}
          placeholder="Igual ao prefixo, se vazio"
          className="ui-input"
        />
      </FormField>
      <FormField label="E-mail Jira" htmlFor={`${idPrefix}-jiraEmail`}>
        <input
          id={`${idPrefix}-jiraEmail`}
          name="jiraEmail"
          type="email"
          defaultValue={team?.jira_email ?? ""}
          className="ui-input"
        />
      </FormField>
      <FormField
        label="Ref. do token (secret)"
        htmlFor={`${idPrefix}-secret`}
        className="sm:col-span-2"
      >
        <input
          id={`${idPrefix}-secret`}
          name="jiraApiTokenSecretRef"
          defaultValue={team?.jira_api_token_secret_ref ?? ""}
          placeholder="JIRA_TOKEN_PRIME — nunca cole o token aqui"
          className="ui-input"
        />
      </FormField>
      <FormCheck>
        <input
          name="jiraIntegrationEnabled"
          type="checkbox"
          defaultChecked={team?.jira_integration_enabled ?? false}
          className="ui-checkbox mt-0.5"
        />
        <span>Integração marcada como ativa</span>
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

export function TeamsAdminPanel({ teams }: { teams: Team[] }) {
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
      <form
        action={createAction}
        className="ui-card grid gap-4 border-dashed p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="sm:col-span-2 lg:col-span-4">
          <FormSectionHeader
            title="Novo time"
            description="Cadastro estruturado. Developers e imports vinculam por team_id."
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
            <th>API</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr
              key={team.id}
              className={!team.is_active ? "opacity-60" : undefined}
            >
              <td className="font-medium">{team.name}</td>
              <td>{team.code}</td>
              <td>{team.jira_key_prefix}-…</td>
              <td>{team.is_active ? "Ativo" : "Inativo"}</td>
              <td className="text-muted-foreground">
                {team.jira_integration_enabled ? "flag on" : "—"}
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
          ))}
        </tbody>
      </DataTable>
    </div>
  );
}
