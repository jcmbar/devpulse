"use client";

import { DataTable } from "@/components/surface";
import { TeamSelect } from "@/components/team-select";
import {
  DestructiveAction,
  InlineActions,
} from "@/components/ui/destructive-action";
import {
  FormActions,
  FormCheck,
  FormFeedback,
  FormField,
  FormSectionHeader,
} from "@/components/ui/form";
import { useActionState, useState } from "react";
import {
  createHolidayAction,
  deleteHolidayAction,
  toggleHolidayActiveAction,
  updateHolidayAction,
  type ConfigFormState,
} from "@/app/app/gestor/actions";
import {
  HOLIDAY_SCOPE_LABELS,
  type Holiday,
  type HolidayScope,
} from "@/types/holiday";
import type { Team } from "@/types/team";

const initialState: ConfigFormState = { error: null, success: null };

const SCOPE_OPTIONS: HolidayScope[] = ["national", "state", "city", "team"];

function teamNameByCode(teams: Team[], code: string): string | null {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return null;
  }
  return teams.find((team) => team.code === normalized)?.name ?? null;
}

function HolidayFields({
  holiday,
  idPrefix,
  teams,
}: {
  holiday?: Holiday;
  idPrefix: string;
  teams: Team[];
}) {
  const [scope, setScope] = useState<HolidayScope>(
    holiday?.scope ?? "national",
  );

  return (
    <>
      <FormField label="Data" htmlFor={`${idPrefix}-holidayOn`}>
        <input
          id={`${idPrefix}-holidayOn`}
          name="holidayOn"
          type="date"
          required
          defaultValue={holiday?.holiday_on ?? ""}
          className="ui-input"
        />
      </FormField>
      <FormField
        label="Nome"
        htmlFor={`${idPrefix}-name`}
        className="sm:col-span-2"
      >
        <input
          id={`${idPrefix}-name`}
          name="name"
          type="text"
          required
          maxLength={120}
          defaultValue={holiday?.name ?? ""}
          placeholder="Ex.: Carnaval"
          className="ui-input"
        />
      </FormField>
      <FormField label="Escopo" htmlFor={`${idPrefix}-scope`}>
        <select
          id={`${idPrefix}-scope`}
          name="scope"
          required
          value={scope}
          onChange={(event) => setScope(event.target.value as HolidayScope)}
          className="ui-select"
        >
          {SCOPE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {HOLIDAY_SCOPE_LABELS[option]}
            </option>
          ))}
        </select>
      </FormField>
      {scope === "team" ? (
        <FormField
          label="Time"
          htmlFor={`${idPrefix}-regionCode`}
          hint="Vínculo via cadastro em /app/teams (`teams.code` no matching)."
        >
          <TeamSelect
            id={`${idPrefix}-regionCode`}
            name="regionCode"
            teams={teams}
            valueMode="code"
            required
            includeEmpty={false}
            emptyLabel="Selecione o time…"
            activeOnly
            defaultValue={holiday?.region_code ?? ""}
          />
        </FormField>
      ) : (
        <FormField
          label={`Região ${scope === "national" ? "(não se aplica)" : ""}`}
          htmlFor={`${idPrefix}-regionCode`}
        >
          <input
            id={`${idPrefix}-regionCode`}
            name="regionCode"
            type="text"
            maxLength={64}
            disabled={scope === "national"}
            defaultValue={holiday?.region_code ?? ""}
            placeholder={
              scope === "state"
                ? "BR-SP"
                : scope === "city"
                  ? "BR-SP-SAO_PAULO"
                  : ""
            }
            className="ui-input"
          />
        </FormField>
      )}
      <FormCheck className="sm:col-span-2 lg:col-span-1">
        <input
          id={`${idPrefix}-isActive`}
          name="isActive"
          type="checkbox"
          defaultChecked={holiday?.is_active ?? true}
          className="ui-checkbox mt-0.5"
        />
        <span>Ativo (impacta capacidade)</span>
      </FormCheck>
    </>
  );
}

export function HolidaysAdminPanel({
  holidays,
  year,
  scopeFilter,
  month,
  teams,
}: {
  holidays: Holiday[];
  year: number;
  scopeFilter: HolidayScope | "all";
  month: number;
  teams: Team[];
}) {
  const [createState, createAction, createPending] = useActionState(
    createHolidayAction,
    initialState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateHolidayAction,
    initialState,
  );
  const [toggleState, toggleAction, togglePending] = useActionState(
    toggleHolidayActiveAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteHolidayAction,
    initialState,
  );
  const [editingId, setEditingId] = useState<string | null>(null);

  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;
  const editing = holidays.find((row) => row.id === editingId) ?? null;

  return (
    <div className="space-y-5">
      <FormSectionHeader
        title="Feriados"
        description={
          <>
            <p>
              Cadastro usado na meta de capacidade. Preferir{" "}
              <span className="font-medium">desativar</span> em vez de excluir
              feriados do seed. Inativos não reduzem horas.
            </p>
            <p className="mt-1 text-xs">
              Estado/cidade usam `region_code` digitado (ex.: BR-SP). Escopo time
              usa select do cadastro estruturado — matching com developers via{" "}
              <span className="font-medium">team_id → teams.code</span>.
            </p>
          </>
        }
      />

      <form className="flex flex-wrap items-end gap-4">
        <input type="hidden" name="month" value={month} />
        <FormField label="Ano" htmlFor="holiday-year">
          <input
            id="holiday-year"
            name="year"
            type="number"
            min="2000"
            max="2100"
            defaultValue={year}
            className="ui-input w-28"
          />
        </FormField>
        <FormField label="Escopo" htmlFor="holidayScope">
          <select
            id="holidayScope"
            name="holidayScope"
            defaultValue={scopeFilter}
            className="ui-select w-auto min-w-[10rem]"
          >
            <option value="all">Todos</option>
            {SCOPE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {HOLIDAY_SCOPE_LABELS[option]}
              </option>
            ))}
          </select>
        </FormField>
        <button type="submit" className="ui-btn-secondary">
          Filtrar
        </button>
      </form>

      <form
        action={createAction}
        className="ui-card grid gap-4 border-dashed p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <p className="text-sm font-medium sm:col-span-2 lg:col-span-3">
          Novo feriado
        </p>
        <HolidayFields idPrefix="create" teams={teams} />
        <div className="sm:col-span-2 lg:col-span-3">
          <FormActions
            primary={{
              label: "Criar feriado",
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
          className="ui-card grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <input type="hidden" name="holidayId" value={editing.id} />
          <p className="text-sm font-medium sm:col-span-2 lg:col-span-3">
            Editando: {editing.name}
          </p>
          <HolidayFields
            key={editing.id}
            holiday={editing}
            idPrefix="edit"
            teams={teams}
          />
          <div className="sm:col-span-2 lg:col-span-3">
            <FormActions
              primary={{
                label: "Salvar alterações",
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
      <FormFeedback error={deleteState.error} success={deleteState.success} />

      {holidays.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum feriado para {year}
          {scopeFilter !== "all"
            ? ` (${HOLIDAY_SCOPE_LABELS[scopeFilter]})`
            : ""}
          .
        </p>
      ) : (
        <DataTable minWidthClassName="min-w-[800px]">
          <thead>
            <tr>
              <th>Data</th>
              <th>Nome</th>
              <th>Escopo</th>
              <th>Região / Time</th>
              <th>Status</th>
              <th>Mês</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday) => {
              const inactive = !holiday.is_active;
              const teamName =
                holiday.scope === "team"
                  ? teamNameByCode(teams, holiday.region_code)
                  : null;
              return (
                <tr
                  key={holiday.id}
                  className={inactive ? "opacity-60" : undefined}
                >
                  <td className="whitespace-nowrap">{holiday.holiday_on}</td>
                  <td>{holiday.name}</td>
                  <td className="text-muted-foreground">
                    {HOLIDAY_SCOPE_LABELS[holiday.scope]}
                  </td>
                  <td className="text-muted-foreground">
                    {holiday.scope === "team"
                      ? teamName
                        ? `${teamName} (${holiday.region_code})`
                        : holiday.region_code || "—"
                      : holiday.region_code || "—"}
                  </td>
                  <td>{holiday.is_active ? "Ativo" : "Inativo"}</td>
                  <td>
                    {holiday.holiday_on.startsWith(yearMonth) ? "sim" : "—"}
                  </td>
                  <td>
                    <InlineActions>
                      <button
                        type="button"
                        onClick={() => setEditingId(holiday.id)}
                        className="ui-btn-ghost"
                      >
                        Editar
                      </button>
                      <form action={toggleAction}>
                        <input
                          type="hidden"
                          name="holidayId"
                          value={holiday.id}
                        />
                        <input
                          type="hidden"
                          name="nextActive"
                          value={holiday.is_active ? "false" : "true"}
                        />
                        <button
                          type="submit"
                          disabled={togglePending}
                          className="ui-btn-ghost"
                        >
                          {holiday.is_active ? "Desativar" : "Ativar"}
                        </button>
                      </form>
                      <DestructiveAction
                        formAction={deleteAction}
                        pending={deletePending}
                        label="Excluir"
                        confirmLabel="Excluir permanente"
                        loadingLabel="Excluindo..."
                        description="Preferível desativar se for feriado do seed."
                      >
                        <input
                          type="hidden"
                          name="holidayId"
                          value={holiday.id}
                        />
                      </DestructiveAction>
                    </InlineActions>
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
