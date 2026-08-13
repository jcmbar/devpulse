"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  deleteStgFindingAction,
  updateStgRunAction,
  updateStgSessionStatusAction,
  upsertStgFindingAction,
  waiveStgSessionAction,
  type StgActionState,
} from "@/app/app/stg/actions";
import { StgResultBanner } from "@/components/stg/stg-result-banner";
import { DataTable } from "@/components/surface";
import {
  FormActions,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import { formatCoverageRatio, stgStatusLabel } from "@/lib/stg/ui";
import type { StgSessionDetail } from "@/services/stg";
import type { Team } from "@/types/team";

const initial: StgActionState = { error: null, success: null };

type SessionHubProps = {
  detail: StgSessionDetail;
  team: Team | null;
  developerNames: Record<string, string>;
};

export function StgSessionHub({
  detail,
  team,
  developerNames,
}: SessionHubProps) {
  const { session, participants, scenarios, runs, findings, coverage, blockers } =
    detail;
  const closed = session.status === "closed";

  const [runState, runAction, runPending] = useActionState(
    updateStgRunAction,
    initial,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    updateStgSessionStatusAction,
    initial,
  );
  const [findingState, findingAction, findingPending] = useActionState(
    upsertStgFindingAction,
    initial,
  );
  const [waiveState, waiveAction, waivePending] = useActionState(
    waiveStgSessionAction,
    initial,
  );
  const [deleteState, deleteAction] = useActionState(
    deleteStgFindingAction,
    initial,
  );

  const activeParticipants = participants.filter(
    (row) => row.participation !== "excluded",
  );

  const includedScenarios = scenarios.filter((row) => row.is_included);

  return (
    <div className="space-y-5">
      <StgResultBanner
        result={session.result}
        detail={
          blockers.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {blockers.map((blocker) => (
                <li key={blocker.findingId}>
                  <span className="font-medium">{blocker.title}</span>
                  {blocker.jiraKey ? ` · ${blocker.jiraKey}` : " · sem card"}
                  {blocker.statusGroup
                    ? ` · grupo ${blocker.statusGroup}`
                    : null}
                  {blocker.jiraStatus ? ` · ${blocker.jiraStatus}` : null}
                </li>
              ))}
            </ul>
          ) : session.result === "waived" && session.waive_reason ? (
            <p>Motivo: {session.waive_reason}</p>
          ) : (
            <p>
              Cobertura {formatCoverageRatio(coverage.ratio)} ·{" "}
              {coverage.done_runs}/{coverage.expected_runs} execuções
            </p>
          )
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetaCard label="Time" value={team?.name ?? "—"} />
        <MetaCard label="Data" value={session.scheduled_on} />
        <MetaCard label="Versão" value={session.version_label} />
        <MetaCard
          label="Workflow"
          value={stgStatusLabel(session.status)}
        />
      </div>

      {!closed ? (
        <div className="ui-dashboard-panel space-y-3">
          <h2 className="text-base font-semibold">Operação da sessão</h2>
          <form action={statusAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="sessionId" value={session.id} />
            {(
              [
                ["in_progress", "Em andamento"],
                ["reviewing", "Em revisão"],
                ["closed", "Fechar"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="submit"
                name="status"
                value={value}
                className="ui-btn-secondary"
                disabled={statusPending || session.status === value}
              >
                {label}
              </button>
            ))}
          </form>
          <FormFeedback error={statusState.error} success={statusState.success} />
        </div>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Cenários e execução</h2>
        <FormFeedback error={runState.error} success={runState.success} />
        {includedScenarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum cenário incluído.</p>
        ) : (
          <div className="space-y-4">
            {includedScenarios.map((scenario) => {
              const scenarioRuns = runs.filter(
                (run) => run.session_scenario_id === scenario.id,
              );
              const done = scenarioRuns.filter((r) => r.status === "done").length;
              return (
                <div key={scenario.id} className="ui-dashboard-panel space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {scenario.module_name}
                      </p>
                      <p className="font-medium">{scenario.scenario_name}</p>
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {done}/{scenarioRuns.length} concluídos
                    </p>
                  </div>
                  <ul className="space-y-1.5">
                    {scenarioRuns.map((run) => (
                      <li
                        key={run.id}
                        className="flex flex-wrap items-center justify-between gap-2 text-sm"
                      >
                        <span>
                          {developerNames[run.developer_id] ??
                            run.developer_id.slice(0, 8)}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {run.status}
                          </span>
                        </span>
                        {!closed ? (
                          <form action={runAction} className="flex gap-1">
                            <input type="hidden" name="runId" value={run.id} />
                            <input
                              type="hidden"
                              name="sessionId"
                              value={session.id}
                            />
                            <button
                              type="submit"
                              name="status"
                              value="done"
                              className="ui-btn-ghost"
                              disabled={runPending || run.status === "done"}
                            >
                              Feito
                            </button>
                            <button
                              type="submit"
                              name="status"
                              value="pending"
                              className="ui-btn-ghost"
                              disabled={runPending || run.status === "pending"}
                            >
                              Pendente
                            </button>
                            <button
                              type="submit"
                              name="status"
                              value="skipped"
                              className="ui-btn-ghost"
                              disabled={runPending || run.status === "skipped"}
                            >
                              Skip
                            </button>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Participantes</h2>
        <DataTable minWidthClassName="min-w-[420px]">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Participação</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((row) => (
              <tr key={row.id}>
                <td>
                  {developerNames[row.developer_id] ??
                    row.developer_id.slice(0, 8)}
                </td>
                <td>{row.participation}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Apontamentos</h2>
        <FormFeedback error={findingState.error} success={findingState.success} />
        <FormFeedback error={deleteState.error} success={deleteState.success} />

        {!closed ? (
          <form
            action={findingAction}
            className="ui-dashboard-panel grid gap-3 sm:grid-cols-2"
          >
            <input type="hidden" name="sessionId" value={session.id} />
            <FormField label="Título" htmlFor="title" className="sm:col-span-2">
              <input id="title" name="title" required className="ui-input" />
            </FormField>
            <FormField label="Impacto" htmlFor="impact">
              <select id="impact" name="impact" className="ui-input" defaultValue="medium">
                <option value="low">Baixo</option>
                <option value="medium">Médio</option>
                <option value="high">Alto</option>
              </select>
            </FormField>
            <FormField label="Card Jira (opcional)" htmlFor="jiraKey">
              <input
                id="jiraKey"
                name="jiraKey"
                className="ui-input"
                placeholder="AP-1234"
              />
            </FormField>
            <FormField label="Identificado por" htmlFor="foundByDeveloperId">
              <select
                id="foundByDeveloperId"
                name="foundByDeveloperId"
                required
                className="ui-input"
                defaultValue={activeParticipants[0]?.developer_id ?? ""}
              >
                {activeParticipants.map((row) => (
                  <option key={row.developer_id} value={row.developer_id}>
                    {developerNames[row.developer_id] ?? row.developer_id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Cenário (opcional)" htmlFor="sessionScenarioId">
              <select
                id="sessionScenarioId"
                name="sessionScenarioId"
                className="ui-input"
                defaultValue=""
              >
                <option value="">—</option>
                {includedScenarios.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.module_name} · {row.scenario_name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Descrição"
              htmlFor="description"
              className="sm:col-span-2"
            >
              <textarea
                id="description"
                name="description"
                rows={2}
                className="ui-input"
              />
            </FormField>
            <div className="sm:col-span-2">
              <FormActions
                primary={{
                  label: "Registrar apontamento",
                  loadingLabel: "Salvando...",
                  pending: findingPending,
                }}
              />
            </div>
          </form>
        ) : null}

        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum apontamento nesta sessão.
          </p>
        ) : (
          <DataTable minWidthClassName="min-w-[720px]">
            <thead>
              <tr>
                <th>Título</th>
                <th>Impacto</th>
                <th>Jira</th>
                <th>Grupo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {findings.map((finding) => (
                <tr key={finding.id}>
                  <td className="font-medium">{finding.title}</td>
                  <td
                    className={
                      finding.impact === "high"
                        ? "font-medium text-danger"
                        : undefined
                    }
                  >
                    {finding.impact}
                  </td>
                  <td className="text-muted-foreground">
                    {finding.jira_key ?? "SEM CARD"}
                    {finding.jira_status_cached
                      ? ` · ${finding.jira_status_cached}`
                      : ""}
                  </td>
                  <td className="text-muted-foreground">
                    {finding.status_group_cached ?? "—"}
                  </td>
                  <td className="text-right">
                    {!closed ? (
                      <form action={deleteAction}>
                        <input type="hidden" name="findingId" value={finding.id} />
                        <input
                          type="hidden"
                          name="sessionId"
                          value={session.id}
                        />
                        <button type="submit" className="ui-btn-ghost">
                          Remover
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>

      {session.result === "blocked" && !closed ? (
        <section className="ui-dashboard-panel space-y-3">
          <h2 className="text-base font-semibold">Decisão / waiver</h2>
          <p className="text-sm text-muted-foreground">
            Liberar produção apesar dos blockers grava result=waived (não
            approved), com motivo obrigatório.
          </p>
          <form action={waiveAction} className="space-y-3">
            <input type="hidden" name="sessionId" value={session.id} />
            <FormField label="Motivo do waiver" htmlFor="reason">
              <textarea id="reason" name="reason" required rows={2} className="ui-input" />
            </FormField>
            <FormFeedback error={waiveState.error} success={waiveState.success} />
            <FormActions
              primary={{
                label: "Registrar waiver",
                loadingLabel: "Salvando...",
                pending: waivePending,
              }}
            />
          </form>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Status Jira vem do sync + mapeamento{" "}
        <Link href="/app/jira" className="underline">
          status_groups
        </Link>
        . A política STG usa apenas grupos semânticos.
      </p>
    </div>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="ui-dashboard-panel px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
