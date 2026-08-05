"use client";

import {
  upsertDeveloperCompensationAction,
  type CompensationFormState,
} from "@/app/app/developers/actions";
import {
  FormActions,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import { suggestHourlyRate } from "@/lib/metrics/suggest-hourly-rate";
import {
  COMPENSATION_BASE_TYPES,
  COMPENSATION_BASE_TYPE_LABELS,
  type DeveloperCompensation,
} from "@/types/developer-compensation";
import { useActionState, useState } from "react";

const initialState: CompensationFormState = {
  error: null,
  success: null,
};

type DeveloperCompensationFormProps = {
  developerId: string;
  compensation: DeveloperCompensation | null;
};

export function DeveloperCompensationForm({
  developerId,
  compensation,
}: DeveloperCompensationFormProps) {
  const [state, formAction, isPending] = useActionState(
    upsertDeveloperCompensationAction,
    initialState,
  );

  const [baseAmount, setBaseAmount] = useState(
    compensation ? String(compensation.base_amount) : "0",
  );
  const [hoursMonth, setHoursMonth] = useState(
    compensation ? String(compensation.contracted_hours_per_month) : "168",
  );
  const [hourlyRate, setHourlyRate] = useState(
    compensation?.hourly_rate != null
      ? String(compensation.hourly_rate)
      : "",
  );

  function suggestFromBase() {
    const base = Number(String(baseAmount).replace(",", "."));
    const hours = Number(String(hoursMonth).replace(",", "."));
    const suggested = suggestHourlyRate(base, hours);
    if (suggested != null) {
      setHourlyRate(String(suggested));
    }
  }

  return (
    <form action={formAction} className="ui-dashboard-panel space-y-5">
      <input type="hidden" name="developerId" value={developerId} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField
          label="Valor base contratual (R$)"
          htmlFor="baseAmount"
          hint="Remuneração de referência do contrato."
        >
          <input
            id="baseAmount"
            name="baseAmount"
            type="text"
            inputMode="decimal"
            required
            value={baseAmount}
            onChange={(event) => setBaseAmount(event.target.value)}
            className="ui-input"
          />
        </FormField>

        <FormField label="Tipo do valor base" htmlFor="baseType">
          <select
            id="baseType"
            name="baseType"
            className="ui-select"
            defaultValue={compensation?.base_type ?? "fixed"}
            required
          >
            {COMPENSATION_BASE_TYPES.map((type) => (
              <option key={type} value={type}>
                {COMPENSATION_BASE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </FormField>

        <FormField
          label="Valor por hora (R$)"
          htmlFor="hourlyRate"
          hint="Opcional. Pode sugerir a partir do base ÷ horas/mês."
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="hourlyRate"
              name="hourlyRate"
              type="text"
              inputMode="decimal"
              value={hourlyRate}
              onChange={(event) => setHourlyRate(event.target.value)}
              className="ui-input sm:min-w-0 sm:flex-1"
              placeholder="Opcional"
            />
            <button
              type="button"
              className="ui-btn-secondary shrink-0 text-xs"
              onClick={suggestFromBase}
            >
              Sugerir a partir do base
            </button>
          </div>
        </FormField>

        <FormField
          label="Horas contratadas / dia"
          htmlFor="contractedHoursPerDay"
        >
          <input
            id="contractedHoursPerDay"
            name="contractedHoursPerDay"
            type="text"
            inputMode="decimal"
            required
            defaultValue={
              compensation
                ? String(compensation.contracted_hours_per_day)
                : "8"
            }
            className="ui-input"
          />
        </FormField>

        <FormField
          label="Horas contratadas / mês"
          htmlFor="contractedHoursPerMonth"
        >
          <input
            id="contractedHoursPerMonth"
            name="contractedHoursPerMonth"
            type="text"
            inputMode="decimal"
            required
            value={hoursMonth}
            onChange={(event) => setHoursMonth(event.target.value)}
            className="ui-input"
          />
        </FormField>

        <FormField
          label="Deslocamento / dia presencial (R$)"
          htmlFor="dailyTravelAmount"
          hint="Usado na Folha: dias presenciais × este valor."
        >
          <input
            id="dailyTravelAmount"
            name="dailyTravelAmount"
            type="text"
            inputMode="decimal"
            defaultValue={
              compensation
                ? String(compensation.daily_travel_amount)
                : "0"
            }
            className="ui-input"
          />
        </FormField>

        <FormField
          label="Refeição / dia presencial (R$)"
          htmlFor="dailyMealAmount"
          hint="Usado na Folha: dias presenciais × este valor."
        >
          <input
            id="dailyMealAmount"
            name="dailyMealAmount"
            type="text"
            inputMode="decimal"
            defaultValue={
              compensation
                ? String(compensation.daily_meal_amount)
                : "0"
            }
            className="ui-input"
          />
        </FormField>

        <FormField
          label="Vigência a partir de"
          htmlFor="effectiveFrom"
          hint="Data de início do valor atual."
        >
          <input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            defaultValue={
              compensation?.effective_from ??
              new Date().toISOString().slice(0, 10)
            }
            className="ui-input"
          />
        </FormField>

        <FormField
          label="Observações"
          htmlFor="notes"
          className="sm:col-span-2 lg:col-span-3"
        >
          <textarea
            id="notes"
            name="notes"
            rows={2}
            defaultValue={compensation?.notes ?? ""}
            className="ui-input min-h-[4.5rem]"
            placeholder="Opcional"
          />
        </FormField>
      </div>

      <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:items-end">
        <FormFeedback error={state.error} success={state.success} />
        <FormActions
          primary={{
            label: "Salvar valores",
            loadingLabel: "Salvando...",
            pending: isPending,
          }}
        />
      </div>
    </form>
  );
}
