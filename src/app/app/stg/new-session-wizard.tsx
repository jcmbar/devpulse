"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import {
  openStgSessionAction,
  type StgActionState,
} from "@/app/app/stg/actions";
import {
  FormActions,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import type { StgModuleWithScenarios } from "@/types/stg";
import type { Team } from "@/types/team";

const initialState: StgActionState = { error: null, success: null };

type ParticipantOption = {
  developerId: string;
  fullName: string;
  suggested: "required" | "optional" | "excluded";
};

type NewSessionWizardProps = {
  teams: Team[];
  initialTeamId: string;
  catalog: StgModuleWithScenarios[];
  participants: ParticipantOption[];
  defaultEnvironment: string;
};

export function NewSessionWizard({
  teams,
  initialTeamId,
  catalog,
  participants,
  defaultEnvironment,
}: NewSessionWizardProps) {
  const [state, action, pending] = useActionState(
    openStgSessionAction,
    initialState,
  );
  const [teamId, setTeamId] = useState(initialTeamId);

  const scenarioCount = useMemo(
    () => catalog.reduce((sum, module) => sum + module.scenarios.length, 0),
    [catalog],
  );

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-6">
      <div className="ui-dashboard-panel space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Time" htmlFor="teamId">
            <select
              id="teamId"
              name="teamId"
              required
              className="ui-input"
              value={teamId}
              onChange={(event) => {
                const next = event.target.value;
                setTeamId(next);
                window.location.href = `/app/stg/new?teamId=${encodeURIComponent(next)}`;
              }}
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Data da STG" htmlFor="scheduledOn">
            <input
              id="scheduledOn"
              name="scheduledOn"
              type="date"
              required
              defaultValue={today}
              className="ui-input"
            />
          </FormField>
          <FormField
            label="Versão / release"
            htmlFor="versionLabel"
            hint="Obrigatório. Ex.: 61 ou staging60"
          >
            <input
              id="versionLabel"
              name="versionLabel"
              required
              className="ui-input"
              placeholder="61"
            />
          </FormField>
          <FormField label="Ambiente" htmlFor="environment">
            <input
              id="environment"
              name="environment"
              defaultValue={defaultEnvironment}
              className="ui-input"
            />
          </FormField>
          <FormField
            label="Escopo / notas"
            htmlFor="scopeNotes"
            className="sm:col-span-2"
          >
            <textarea
              id="scopeNotes"
              name="scopeNotes"
              rows={2}
              className="ui-input"
              placeholder="Ex.: Core e Retaguarda · foco PDV e Nota de Entrada"
            />
          </FormField>
        </div>
      </div>

      <div className="ui-dashboard-panel space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Cenários do catálogo</h2>
            <p className="text-sm text-muted-foreground">
              {scenarioCount > 0
                ? `${scenarioCount} cenário(s) ativos — desmarque o que não entra nesta sessão.`
                : "Nenhum cenário ativo. Cadastre o catálogo antes de abrir."}
            </p>
          </div>
          <Link href={`/app/stg/catalog?teamId=${teamId}`} className="ui-btn-ghost">
            Editar catálogo
          </Link>
        </div>
        {scenarioCount === 0 ? (
          <p className="text-sm text-warning">
            Catálogo vazio para este time. A abertura será bloqueada até haver
            cenários.
          </p>
        ) : (
          <div className="space-y-4">
            {catalog.map((module) => (
              <div key={module.id} className="space-y-2">
                <p className="text-sm font-medium">{module.name}</p>
                <ul className="space-y-1.5">
                  {module.scenarios.map((scenario) => (
                    <li key={scenario.id} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        name="scenarioId"
                        value={scenario.id}
                        defaultChecked
                        className="ui-checkbox mt-0.5"
                      />
                      <span>
                        <span className="font-medium">{scenario.name}</span>
                        {scenario.summary ? (
                          <span className="block text-xs text-muted-foreground">
                            {scenario.summary}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ui-dashboard-panel space-y-3">
        <div>
          <h2 className="text-base font-semibold">Participantes</h2>
          <p className="text-sm text-muted-foreground">
            Sugestão automática do time. Excluded não entra no %.
          </p>
        </div>
        {participants.length === 0 ? (
          <p className="text-sm text-warning">
            Nenhum desenvolvedor ativo neste time. Cadastre pessoas ou ajuste o
            time.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Pessoa</th>
                  <th className="py-2">Participação</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((row) => (
                  <tr key={row.developerId} className="border-b border-border/40">
                    <td className="py-2 pr-3 font-medium">{row.fullName}</td>
                    <td className="py-2">
                      <select
                        name={`participation:${row.developerId}`}
                        defaultValue={row.suggested}
                        className="ui-input max-w-[12rem]"
                      >
                        <option value="required">Obrigatório</option>
                        <option value="optional">Opcional</option>
                        <option value="excluded">Não participa</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <FormFeedback error={state.error} success={state.success} />
      <div className="flex flex-wrap items-center gap-2">
        <FormActions
          primary={{
            label: "Abrir sessão",
            loadingLabel: "Abrindo...",
            pending,
            disabled: scenarioCount === 0 || participants.length === 0,
          }}
        />
        <Link href="/app/stg" className="ui-btn-secondary">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
