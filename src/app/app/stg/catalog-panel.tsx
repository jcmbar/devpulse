"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  removeStgDefaultParticipantAction,
  setStgDefaultParticipantAction,
  updateStgApprovalPolicyAction,
  upsertStgModuleAction,
  upsertStgScenarioAction,
  type StgActionState,
} from "@/app/app/stg/actions";
import {
  FormActions,
  FormCheck,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";
import type {
  StgApprovalPolicy,
  StgDefaultParticipant,
  StgModuleWithScenarios,
  StgScenario,
} from "@/types/stg";
import type { Team } from "@/types/team";

const initial: StgActionState = { error: null, success: null };

type CatalogPanelProps = {
  team: Team;
  teams: Team[];
  catalog: StgModuleWithScenarios[];
  defaults: {
    default_environment: string;
    approval_policy: StgApprovalPolicy;
  };
  defaultParticipants: StgDefaultParticipant[];
  developers: Array<{ id: string; full_name: string }>;
};

function DirtySaveButton({
  dirty,
  pending,
}: {
  dirty: boolean;
  pending: boolean;
}) {
  return (
    <button
      type="submit"
      name="intent"
      value="save"
      disabled={pending || !dirty}
      className={cn(dirty ? "ui-btn-save-pending" : "ui-btn-secondary")}
      aria-live="polite"
    >
      {pending ? "Salvando..." : dirty ? "Salvar" : "Salvo"}
    </button>
  );
}

function CatalogScenarioRow({
  scenario,
  moduleId,
  scenarioAction,
  scenarioPending,
}: {
  scenario: StgScenario;
  moduleId: string;
  scenarioAction: (payload: FormData) => void;
  scenarioPending: boolean;
}) {
  const [name, setName] = useState(scenario.name);
  const [summary, setSummary] = useState(scenario.summary ?? "");

  useEffect(() => {
    setName(scenario.name);
    setSummary(scenario.summary ?? "");
  }, [scenario.id, scenario.name, scenario.summary, scenario.updated_at]);

  const dirty =
    name.trim() !== scenario.name.trim() ||
    summary.trim() !== (scenario.summary ?? "").trim();

  return (
    <li>
      <form
        action={scenarioAction}
        className={cn(
          "grid gap-2 sm:grid-cols-[1fr_1fr_auto]",
          !scenario.is_active && "opacity-70",
        )}
      >
        <input type="hidden" name="id" value={scenario.id} />
        <input type="hidden" name="moduleId" value={moduleId} />
        <input type="hidden" name="sortOrder" value={scenario.sort_order} />
        <input
          type="hidden"
          name="isActive"
          value={scenario.is_active ? "true" : "false"}
        />
        <input
          name="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label={`Nome do cenário ${scenario.name}`}
          className="ui-input"
        />
        <input
          name="summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          placeholder="Resumo (opcional)"
          aria-label={`Resumo do cenário ${scenario.name}`}
          className="ui-input"
        />
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <DirtySaveButton dirty={dirty} pending={scenarioPending} />
          <button
            type="submit"
            name="intent"
            value={scenario.is_active ? "deactivate" : "activate"}
            className="ui-btn-ghost"
            disabled={scenarioPending}
          >
            {scenario.is_active ? "Desativar" : "Ativar"}
          </button>
        </div>
      </form>
    </li>
  );
}

function CatalogModuleCard({
  module,
  teamId,
  moduleAction,
  modulePending,
  scenarioAction,
  scenarioPending,
}: {
  module: StgModuleWithScenarios;
  teamId: string;
  moduleAction: (payload: FormData) => void;
  modulePending: boolean;
  scenarioAction: (payload: FormData) => void;
  scenarioPending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(module.name);
  const panelId = useId();

  useEffect(() => {
    setName(module.name);
  }, [module.id, module.name, module.updated_at]);

  const dirty = name.trim() !== module.name.trim();
  const activeScenarios = module.scenarios.filter((row) => row.is_active).length;

  return (
    <div
      className={cn(
        "ui-dashboard-panel space-y-3",
        !module.is_active && "opacity-70",
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronDown
            className={cn(
              "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-150",
              open ? "rotate-0" : "-rotate-90",
            )}
            strokeWidth={2}
            aria-hidden
          />
          <div className="min-w-0">
            <p className="font-medium text-foreground">{module.name}</p>
            <p className="text-xs text-muted-foreground">
              {module.scenarios.length} cenário(s)
              {activeScenarios !== module.scenarios.length
                ? ` · ${activeScenarios} ativo(s)`
                : null}
              {!module.is_active ? " · inativo" : null}
              {dirty ? " · alterações pendentes" : null}
            </p>
          </div>
        </button>
      </div>

      <div
        id={panelId}
        hidden={!open}
        className={cn("space-y-3", !open && "hidden")}
      >
          <form
            action={moduleAction}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
          >
            <input type="hidden" name="id" value={module.id} />
            <input type="hidden" name="teamId" value={teamId} />
            <input type="hidden" name="sortOrder" value={module.sort_order} />
            <input
              type="hidden"
              name="isActive"
              value={module.is_active ? "true" : "false"}
            />
            <FormField
              label="Módulo"
              htmlFor={`module-name-${module.id}`}
              className="min-w-0 flex-1"
            >
              <input
                id={`module-name-${module.id}`}
                name="name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="ui-input"
              />
            </FormField>
            <div className="flex flex-wrap gap-2">
              <DirtySaveButton dirty={dirty} pending={modulePending} />
              <button
                type="submit"
                name="intent"
                value={module.is_active ? "deactivate" : "activate"}
                className="ui-btn-ghost"
                disabled={modulePending}
              >
                {module.is_active ? "Desativar" : "Ativar"}
              </button>
            </div>
          </form>
          {!module.is_active ? (
            <p className="text-xs text-muted-foreground">
              Módulo inativo — não entra em novas sessões.
            </p>
          ) : null}

          <ul className="space-y-3 border-t border-border/60 pt-3">
            {module.scenarios.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                Nenhum cenário ainda.
              </li>
            ) : (
              module.scenarios.map((scenario) => (
                <CatalogScenarioRow
                  key={scenario.id}
                  scenario={scenario}
                  moduleId={module.id}
                  scenarioAction={scenarioAction}
                  scenarioPending={scenarioPending}
                />
              ))
            )}
          </ul>

          <form
            action={scenarioAction}
            className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <input type="hidden" name="moduleId" value={module.id} />
            <input
              name="name"
              required
              placeholder="Novo cenário"
              className="ui-input"
            />
            <input
              name="summary"
              placeholder="Resumo (opcional)"
              className="ui-input"
            />
            <button
              type="submit"
              name="intent"
              value="save"
              className="ui-btn-secondary"
              disabled={scenarioPending}
            >
              Adicionar
            </button>
          </form>
      </div>
    </div>
  );
}

export function StgCatalogPanel({
  team,
  teams,
  catalog,
  defaults,
  defaultParticipants,
  developers,
}: CatalogPanelProps) {
  const [moduleState, moduleAction, modulePending] = useActionState(
    upsertStgModuleAction,
    initial,
  );
  const [scenarioState, scenarioAction, scenarioPending] = useActionState(
    upsertStgScenarioAction,
    initial,
  );
  const [policyState, policyAction, policyPending] = useActionState(
    updateStgApprovalPolicyAction,
    initial,
  );
  const [participantState, participantAction, participantPending] =
    useActionState(setStgDefaultParticipantAction, initial);
  const [removeState, removeAction] = useActionState(
    removeStgDefaultParticipantAction,
    initial,
  );

  const safe = new Set(defaults.approval_policy.safe_status_groups);

  return (
    <div className="space-y-6">
      <div className="ui-dashboard-panel flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Time do catálogo</p>
          <p className="font-medium">{team.name}</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          <FormField label="Trocar time" htmlFor="catalogTeam">
            <select
              id="catalogTeam"
              className="ui-input"
              defaultValue={team.id}
              onChange={(event) => {
                window.location.href = `/app/stg/catalog?teamId=${encodeURIComponent(event.target.value)}`;
              }}
            >
              {teams.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </FormField>
        </form>
      </div>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Módulos e cenários</h2>
        <p className="text-sm text-muted-foreground">
          Expanda um módulo para editar. Alterações ficam pendentes até salvar.
        </p>
        <FormFeedback error={moduleState.error} success={moduleState.success} />
        <FormFeedback
          error={scenarioState.error}
          success={scenarioState.success}
        />
        {catalog.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Catálogo vazio. Adicione o primeiro módulo abaixo.
          </p>
        ) : (
          <div className="space-y-3">
            {catalog.map((module) => (
              <CatalogModuleCard
                key={module.id}
                module={module}
                teamId={team.id}
                moduleAction={moduleAction}
                modulePending={modulePending}
                scenarioAction={scenarioAction}
                scenarioPending={scenarioPending}
              />
            ))}
          </div>
        )}

        <form action={moduleAction} className="ui-dashboard-panel space-y-3">
          <input type="hidden" name="teamId" value={team.id} />
          <h3 className="text-sm font-medium">Novo módulo</h3>
          <FormField label="Nome" htmlFor="moduleName">
            <input
              id="moduleName"
              name="name"
              required
              className="ui-input"
              placeholder="Ex.: PDV"
            />
          </FormField>
          <FormActions
            primary={{
              label: "Salvar módulo",
              loadingLabel: "Salvando...",
              pending: modulePending,
            }}
          />
        </form>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Participantes padrão</h2>
        <FormFeedback
          error={participantState.error}
          success={participantState.success}
        />
        <FormFeedback error={removeState.error} success={removeState.success} />
        {defaultParticipants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum padrão. A sugestão na abertura usará todos os ativos do time
            como opcionais.
          </p>
        ) : (
          <ul className="space-y-2">
            {defaultParticipants.map((row) => {
              const name =
                developers.find((d) => d.id === row.developer_id)?.full_name ??
                row.developer_id.slice(0, 8);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{name}</span>
                    <span className="text-muted-foreground"> · {row.role}</span>
                  </span>
                  <form action={removeAction}>
                    <input type="hidden" name="teamId" value={team.id} />
                    <input
                      type="hidden"
                      name="developerId"
                      value={row.developer_id}
                    />
                    <button type="submit" className="ui-btn-ghost">
                      Remover
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
        <form
          action={participantAction}
          className="ui-dashboard-panel grid gap-3 sm:grid-cols-[1fr_10rem_auto]"
        >
          <input type="hidden" name="teamId" value={team.id} />
          <FormField label="Pessoa" htmlFor="developerId">
            <select id="developerId" name="developerId" required className="ui-input">
              {developers.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Papel" htmlFor="role">
            <select id="role" name="role" className="ui-input" defaultValue="required">
              <option value="required">Obrigatório</option>
              <option value="optional">Opcional</option>
            </select>
          </FormField>
          <div className="flex items-end">
            <button
              type="submit"
              className="ui-btn-secondary"
              disabled={participantPending || developers.length === 0}
            >
              Adicionar
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Política de aprovação</h2>
            <p className="text-sm text-muted-foreground">
              Só grupos semânticos. Aliases de status ficam no{" "}
              <Link href="/app/jira" className="underline">
                Jira
              </Link>
              .
            </p>
          </div>
        </div>
        <form action={policyAction} className="ui-dashboard-panel space-y-4">
          <input type="hidden" name="teamId" value={team.id} />
          <FormField label="Ambiente padrão" htmlFor="defaultEnvironment">
            <input
              id="defaultEnvironment"
              name="defaultEnvironment"
              defaultValue={defaults.default_environment}
              className="ui-input max-w-xs"
            />
          </FormField>
          <div className="space-y-2">
            <p className="ui-label">Grupos safe para PROD (Alto)</p>
            {(
              [
                ["done", "done"],
                ["validation", "validation"],
                ["development", "development"],
                ["analysis", "analysis"],
              ] as const
            ).map(([value, label]) => (
              <FormCheck key={value}>
                <input
                  type="checkbox"
                  name="safeStatusGroup"
                  value={value}
                  defaultChecked={safe.has(value)}
                  className="ui-checkbox mt-0.5"
                />
                <span>{label}</span>
              </FormCheck>
            ))}
          </div>
          <FormCheck>
            <input
              type="checkbox"
              name="missingCardBlocksHigh"
              defaultChecked={defaults.approval_policy.missing_card_blocks_high}
              className="ui-checkbox mt-0.5"
            />
            <span>Alto sem card bloqueia</span>
          </FormCheck>
          <FormCheck>
            <input
              type="checkbox"
              name="unmappedBlocks"
              defaultChecked={
                defaults.approval_policy.unmapped_or_other_blocks
              }
              className="ui-checkbox mt-0.5"
            />
            <span>Grupo other / não mapeado bloqueia (fail-closed)</span>
          </FormCheck>
          <FormFeedback error={policyState.error} success={policyState.success} />
          <FormActions
            primary={{
              label: "Salvar política",
              loadingLabel: "Salvando...",
              pending: policyPending,
            }}
          />
        </form>
      </section>
    </div>
  );
}
