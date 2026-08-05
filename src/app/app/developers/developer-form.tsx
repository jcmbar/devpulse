"use client";

import { TeamSelect } from "@/components/team-select";
import {
  FormActions,
  FormCheck,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import { useActionState } from "react";
import {
  createDeveloperAction,
  updateDeveloperAction,
  type DeveloperFormState,
} from "@/app/app/developers/actions";
import type { DeveloperListItem } from "@/services/developers";
import {
  DEVELOPER_JOB_TITLES,
  DEVELOPER_JOB_TITLE_LABELS,
} from "@/types/developer-compensation";
import type { Team } from "@/types/team";

const initialState: DeveloperFormState = { error: null };

type DeveloperFormProps = {
  mode: "create" | "edit";
  developer?: DeveloperListItem;
  teams: Team[];
};

export function DeveloperForm({ mode, developer, teams }: DeveloperFormProps) {
  const action = mode === "create" ? createDeveloperAction : updateDeveloperAction;
  const [state, formAction, isPending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="ui-dashboard-panel space-y-5">
      {mode === "edit" && developer ? (
        <input type="hidden" name="developerId" value={developer.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField label="Nome" htmlFor="fullName" className="sm:col-span-2 lg:col-span-3">
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            defaultValue={developer?.full_name ?? ""}
            className="ui-input"
          />
        </FormField>

        <FormField label="E-mail" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={developer?.email ?? ""}
            className="ui-input"
          />
        </FormField>

        <FormField
          label="Cargo / Função"
          htmlFor="jobTitle"
          hint="Perfil profissional (não é o privilégio de acesso)."
        >
          <select
            id="jobTitle"
            name="jobTitle"
            className="ui-select"
            defaultValue={developer?.job_title ?? "developer"}
            required
          >
            {DEVELOPER_JOB_TITLES.map((title) => (
              <option key={title} value={title}>
                {DEVELOPER_JOB_TITLE_LABELS[title]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Jira Account ID (opcional)" htmlFor="jiraAccountId">
          <input
            id="jiraAccountId"
            name="jiraAccountId"
            type="text"
            defaultValue={developer?.jira_account_id ?? ""}
            className="ui-input"
          />
        </FormField>

        <FormField
          label="Time"
          htmlFor="teamId"
          hint="team_id estruturado; código auxiliar sincroniza feriados de escopo time."
        >
          <TeamSelect
            id="teamId"
            name="teamId"
            teams={teams}
            defaultValue={developer?.team_id ?? ""}
            includeEmpty
            emptyLabel="Sem time"
          />
        </FormField>

        <FormField label="Estado" htmlFor="stateCode">
          <input
            id="stateCode"
            name="stateCode"
            type="text"
            placeholder="BR-SP"
            defaultValue={developer?.state_code ?? ""}
            className="ui-input"
          />
        </FormField>

        <FormField label="Cidade" htmlFor="cityCode">
          <input
            id="cityCode"
            name="cityCode"
            type="text"
            placeholder="BR-SP-SAO_PAULO"
            defaultValue={developer?.city_code ?? ""}
            className="ui-input"
          />
        </FormField>
      </div>

      <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <FormCheck>
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={developer?.is_active ?? true}
            className="ui-checkbox mt-0.5"
          />
          <span>Cadastro ativo</span>
        </FormCheck>

        <div className="flex min-w-0 flex-col gap-2 sm:items-end">
          <FormFeedback error={state.error} />
          <FormActions
            primary={{
              label:
                mode === "create" ? "Cadastrar pessoa" : "Salvar alterações",
              loadingLabel: "Salvando...",
              pending: isPending,
            }}
          />
        </div>
      </div>
    </form>
  );
}
