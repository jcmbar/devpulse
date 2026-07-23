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
    <form action={formAction} className="space-y-5">
      {mode === "edit" && developer ? (
        <input type="hidden" name="developerId" value={developer.id} />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nome" htmlFor="fullName" className="sm:col-span-2">
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

        <FormField label="Jira Account ID (opcional)" htmlFor="jiraAccountId">
          <input
            id="jiraAccountId"
            name="jiraAccountId"
            type="text"
            defaultValue={developer?.jira_account_id ?? ""}
            className="ui-input"
          />
        </FormField>
      </div>

      <FormField
        label="Time"
        htmlFor="teamId"
        hint="Vínculo estruturado via team_id. O código auxiliar sincroniza com teams.code para feriados de escopo time."
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

      <fieldset className="ui-fieldset">
        <legend className="ui-legend">Localidade</legend>
        <div className="grid gap-4 sm:grid-cols-2">
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
      </fieldset>

      <FormCheck>
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={developer?.is_active ?? true}
          className="ui-checkbox mt-0.5"
        />
        <span>Developer ativo</span>
      </FormCheck>

      <FormFeedback error={state.error} />

      <FormActions
        primary={{
          label:
            mode === "create" ? "Cadastrar developer" : "Salvar alterações",
          loadingLabel: "Salvando...",
          pending: isPending,
        }}
      />
    </form>
  );
}
