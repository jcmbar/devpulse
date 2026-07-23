"use client";

import { DataTable } from "@/components/surface";
import { DestructiveAction } from "@/components/ui/destructive-action";
import {
  FormActions,
  FormFeedback,
  FormField,
  FormSectionHeader,
} from "@/components/ui/form";
import { useActionState } from "react";
import {
  deleteDeveloperCapacityAction,
  updateThresholdsAction,
  updateWeekdayCapacityAction,
  upsertDeveloperCapacityAction,
  type ConfigFormState,
} from "@/app/app/gestor/actions";
import type { PerformanceThresholds } from "@/lib/metrics/performance-bands";
import { weekdayLabel } from "@/lib/metrics/weekday-labels";
import type { CapacityWeekdayHours, DeveloperMonthlyCapacity } from "@/types/capacity";

const initialState: ConfigFormState = { error: null, success: null };

type DeveloperOption = {
  id: string;
  full_name: string;
  is_active: boolean;
};

function pctDefault(rate: number): string {
  return String(Math.round(rate * 1000) / 10);
}

export function ThresholdsForm({
  thresholds,
}: {
  thresholds: PerformanceThresholds;
}) {
  const [state, formAction, isPending] = useActionState(
    updateThresholdsAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormSectionHeader
        title="Faixas de aproveitamento"
        description="Limites crescentes em %. Ex.: abaixo de 70 → 70–84 → 85–99 → 100+. O cálculo do aproveitamento não muda — só a interpretação visual."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField
          label="Limite 1 (%)"
          htmlFor="bandVeryLowMax"
          hint="Abaixo disso = faixa 1"
        >
          <input
            id="bandVeryLowMax"
            name="bandVeryLowMax"
            type="number"
            step="0.1"
            min="1"
            max="99"
            required
            defaultValue={pctDefault(thresholds.bandVeryLowMax)}
            className="ui-input"
          />
        </FormField>
        <FormField
          label="Limite 2 (%)"
          htmlFor="bandLowMax"
          hint="Abaixo disso = faixa 2"
        >
          <input
            id="bandLowMax"
            name="bandLowMax"
            type="number"
            step="0.1"
            min="1"
            max="200"
            required
            defaultValue={pctDefault(thresholds.bandLowMax)}
            className="ui-input"
          />
        </FormField>
        <FormField
          label="Limite 3 (%)"
          htmlFor="bandAverageMax"
          hint="A partir disso = faixa 4 (excelente)"
        >
          <input
            id="bandAverageMax"
            name="bandAverageMax"
            type="number"
            step="0.1"
            min="1"
            max="200"
            required
            defaultValue={pctDefault(thresholds.bandAverageMax)}
            className="ui-input"
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField label="Rótulo faixa 1" htmlFor="labelVeryLow">
          <input
            id="labelVeryLow"
            name="labelVeryLow"
            type="text"
            required
            defaultValue={thresholds.labelVeryLow}
            className="ui-input"
          />
        </FormField>
        <FormField label="Rótulo faixa 2" htmlFor="labelLow">
          <input
            id="labelLow"
            name="labelLow"
            type="text"
            required
            defaultValue={thresholds.labelLow}
            className="ui-input"
          />
        </FormField>
        <FormField label="Rótulo faixa 3" htmlFor="labelAverage">
          <input
            id="labelAverage"
            name="labelAverage"
            type="text"
            required
            defaultValue={thresholds.labelAverage}
            className="ui-input"
          />
        </FormField>
        <FormField label="Rótulo faixa 4" htmlFor="labelExcellent">
          <input
            id="labelExcellent"
            name="labelExcellent"
            type="text"
            required
            defaultValue={thresholds.labelExcellent}
            className="ui-input"
          />
        </FormField>
      </div>

      <FormFeedback error={state.error} success={state.success} />

      <FormActions
        primary={{
          label: "Salvar faixas",
          loadingLabel: "Salvando...",
          pending: isPending,
        }}
      />
    </form>
  );
}

export function WeekdayCapacityForm({
  weekdayHours,
  previewHours,
  year,
  month,
}: {
  weekdayHours: CapacityWeekdayHours[];
  previewHours: number | null;
  year: number;
  month: number;
}) {
  const [state, formAction, isPending] = useActionState(
    updateWeekdayCapacityAction,
    initialState,
  );
  const byWeekday = new Map(
    weekdayHours.map((row) => [row.weekday, Number(row.hours_per_day)]),
  );

  return (
    <form action={formAction} className="space-y-5">
      <FormSectionHeader
        title="Capacidade padrão do time"
        description={
          <>
            <p>
              Horas-alvo por dia da semana (lógica Compilado K22:N30). Soma dos
              dias do mês = meta herdada por quem não tem override.
            </p>
            {previewHours != null ? (
              <p className="mt-2 text-foreground">
                Meta estimada para{" "}
                <span className="font-medium">
                  {String(month).padStart(2, "0")}/{year}
                </span>
                :{" "}
                <span className="font-medium">
                  {previewHours.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  h
                </span>
              </p>
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7].map((weekday) => (
          <FormField
            key={weekday}
            label={weekdayLabel(weekday)}
            htmlFor={`weekday_${weekday}`}
          >
            <input
              id={`weekday_${weekday}`}
              name={`weekday_${weekday}`}
              type="number"
              step="0.5"
              min="0"
              max="24"
              required
              defaultValue={byWeekday.get(weekday) ?? 0}
              className="ui-input"
            />
          </FormField>
        ))}
      </div>

      <FormFeedback error={state.error} success={state.success} />

      <FormActions
        primary={{
          label: "Salvar capacidade do time",
          loadingLabel: "Salvando...",
          pending: isPending,
        }}
      />
    </form>
  );
}

export function DeveloperCapacityPanel({
  developers,
  overrides,
  year,
  month,
  teamDefaultHours,
}: {
  developers: DeveloperOption[];
  overrides: DeveloperMonthlyCapacity[];
  year: number;
  month: number;
  teamDefaultHours: number | null;
}) {
  const [upsertState, upsertAction, upsertPending] = useActionState(
    upsertDeveloperCapacityAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteDeveloperCapacityAction,
    initialState,
  );

  const overrideByDeveloper = new Map(
    overrides.map((row) => [row.developer_id, row]),
  );

  const activeDevelopers = developers.filter((d) => d.is_active);

  return (
    <div className="space-y-5">
      <FormSectionHeader
        title="Overrides por developer"
        description={`Capacidade mensal específica. Sem override, herda o padrão do time${
          teamDefaultHours != null
            ? ` (${teamDefaultHours.toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })} h)`
            : ""
        }.`}
      />

      <form
        action={upsertAction}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input type="hidden" name="year" value={year} />
        <input type="hidden" name="month" value={month} />
        <FormField
          label="Developer"
          htmlFor="developerId"
          className="sm:col-span-2"
        >
          <select
            id="developerId"
            name="developerId"
            required
            className="ui-select"
            defaultValue=""
          >
            <option value="" disabled>
              Selecione…
            </option>
            {activeDevelopers.map((developer) => (
              <option key={developer.id} value={developer.id}>
                {developer.full_name}
                {overrideByDeveloper.has(developer.id)
                  ? " (já tem override)"
                  : ""}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Horas necessárias" htmlFor="requiredHours">
          <input
            id="requiredHours"
            name="requiredHours"
            type="number"
            step="0.5"
            min="0"
            required
            defaultValue={teamDefaultHours ?? 0}
            className="ui-input"
          />
        </FormField>
        <FormField label="Notas (opcional)" htmlFor="notes">
          <input id="notes" name="notes" type="text" className="ui-input" />
        </FormField>
        <div className="sm:col-span-2 lg:col-span-4">
          <FormActions
            primary={{
              label: "Salvar override",
              loadingLabel: "Salvando...",
              pending: upsertPending,
            }}
          />
        </div>
      </form>

      <FormFeedback error={upsertState.error} success={upsertState.success} />
      <FormFeedback error={deleteState.error} success={deleteState.success} />

      {overrides.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum override neste mês — todos usam o padrão do time.
        </p>
      ) : (
        <DataTable minWidthClassName="min-w-[560px]">
          <thead>
            <tr>
              <th>Developer</th>
              <th>Horas</th>
              <th>Notas</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {overrides.map((row) => {
              const developer = developers.find(
                (item) => item.id === row.developer_id,
              );
              return (
                <tr key={row.id}>
                  <td>{developer?.full_name ?? row.developer_id}</td>
                  <td>
                    {row.required_hours.toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    h
                  </td>
                  <td className="text-muted-foreground">{row.notes ?? "—"}</td>
                  <td>
                    <DestructiveAction
                      formAction={deleteAction}
                      pending={deletePending}
                      label="Remover"
                      confirmLabel="Remover override"
                      loadingLabel="Removendo..."
                      description="Volta a usar a meta padrão do time."
                    >
                      <input
                        type="hidden"
                        name="developerId"
                        value={row.developer_id}
                      />
                      <input type="hidden" name="year" value={year} />
                      <input type="hidden" name="month" value={month} />
                    </DestructiveAction>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
