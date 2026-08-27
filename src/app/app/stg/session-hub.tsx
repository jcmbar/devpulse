"use client";

import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  ClipboardList,
  NotebookPen,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useActionState,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  deleteStgFindingAction,
  deleteStgSessionAction,
  updateStgRunAction,
  updateStgSessionStatusAction,
  upsertStgFindingAction,
  waiveStgSessionAction,
  type StgActionState,
} from "@/app/app/stg/actions";
import { StgResultBanner } from "@/components/stg/stg-result-banner";
import { DataTable } from "@/components/surface";
import { PersonAvatar } from "@/components/person-avatar";
import { DestructiveAction } from "@/components/ui/destructive-action";
import {
  FormActions,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import { formatCoverageRatio, stgStatusLabel } from "@/lib/stg/ui";
import { cn } from "@/lib/utils";
import type { StgSessionDetail } from "@/services/stg";
import type {
  StgFinding,
  StgFindingImpact,
  StgParticipation,
  StgScenarioRun,
  StgSessionScenario,
} from "@/types/stg";
import type { StgFindingJiraDetail } from "@/services/stg";
import type { Team } from "@/types/team";

const PARTICIPATION_CONFIG: Record<
  StgParticipation,
  { label: string; chipClass: string }
> = {
  required: {
    label: "Obrigatório",
    chipClass:
      "border-brand/40 bg-brand/10 text-brand dark:text-cyan-300 font-semibold",
  },
  optional: {
    label: "Opcional",
    chipClass:
      "border-border/70 bg-card/80 text-muted-foreground font-medium",
  },
  excluded: {
    label: "Dispensado",
    chipClass:
      "border-border/40 bg-muted/40 text-muted-foreground/60 line-through font-normal",
  },
};

const FLOAT_CLASSES = [
  "ui-stg-floating-avatar-a",
  "ui-stg-floating-avatar-b",
  "ui-stg-floating-avatar-c",
] as const;

const FLOAT_DELAYS = [
  "0s",
  "-1.4s",
  "-2.8s",
  "-0.7s",
  "-2.1s",
  "-3.5s",
  "-1.0s",
  "-2.5s",
] as const;

function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[0] ?? fullName;
}

const initial: StgActionState = { error: null, success: null };

type SessionHubProps = {
  detail: StgSessionDetail;
  team: Team | null;
  developerNames: Record<string, string>;
  developerAvatarUrls?: Record<string, string | null>;
  canEdit: boolean;
  canDelete: boolean;
  loggedInDeveloperId: string | null;
  loggedInDeveloperName: string | null;
};

export function StgSessionHub({
  detail,
  team,
  developerNames,
  developerAvatarUrls = {},
  canEdit,
  canDelete,
  loggedInDeveloperId,
  loggedInDeveloperName,
}: SessionHubProps) {
  const {
    session,
    participants,
    scenarios,
    runs,
    findings,
    coverage,
    blockers,
    jiraByFindingId = {},
  } = detail;
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
  const [deleteFindingState, deleteFindingAction] = useActionState(
    deleteStgFindingAction,
    initial,
  );
  const [deleteSessionState, deleteSessionAction, deleteSessionPending] =
    useActionState(deleteStgSessionAction, initial);

  const [findingScenario, setFindingScenario] =
    useState<StgSessionScenario | null>(null);
  const [findingLinkError, setFindingLinkError] = useState<string | null>(null);

  const [findingFilters, setFindingFilters] = useState({
    title: "",
    scenarioId: "",
    impact: "",
    description: "",
    jiraKey: "",
    jiraStatus: "",
    jiraSummary: "",
    jiraAssignee: "",
    foundBy: "",
  });

  const clearFindingFilters = () => {
    setFindingFilters({
      title: "",
      scenarioId: "",
      impact: "",
      description: "",
      jiraKey: "",
      jiraStatus: "",
      jiraSummary: "",
      jiraAssignee: "",
      foundBy: "",
    });
  };

  const hasActiveFindingFilters = Object.values(findingFilters).some(
    (val) => val.trim() !== "",
  );

  const includedScenarios = scenarios.filter((row) => row.is_included);
  const scenarioNameById = Object.fromEntries(
    includedScenarios.map((row) => [
      row.id,
      `${row.module_name} · ${row.scenario_name}`,
    ]),
  );

  const uniqueScenarioIds = useMemo(() => {
    const ids = new Set<string>();
    findings.forEach((f) => {
      if (f.session_scenario_id) ids.add(f.session_scenario_id);
    });
    return Array.from(ids);
  }, [findings]);

  const uniqueJiraStatuses = useMemo(() => {
    const statuses = new Set<string>();
    findings.forEach((f) => {
      const st = jiraByFindingId[f.id]?.status ?? f.jira_status_cached;
      if (st) statuses.add(st);
    });
    return Array.from(statuses).sort((a, b) => a.localeCompare(b));
  }, [findings, jiraByFindingId]);

  const uniqueJiraAssignees = useMemo(() => {
    const assignees = new Set<string>();
    findings.forEach((f) => {
      const assignee = jiraByFindingId[f.id]?.assigneeDisplayName;
      if (assignee) assignees.add(assignee);
    });
    return Array.from(assignees).sort((a, b) => a.localeCompare(b));
  }, [findings, jiraByFindingId]);

  const uniqueFoundByIds = useMemo(() => {
    const ids = new Set<string>();
    findings.forEach((f) => {
      if (f.found_by_developer_id) ids.add(f.found_by_developer_id);
    });
    return Array.from(ids);
  }, [findings]);

  const filteredFindings = useMemo(() => {
    return findings.filter((finding) => {
      const jiraDetail = jiraByFindingId[finding.id];

      if (findingFilters.title.trim()) {
        const query = findingFilters.title.trim().toLowerCase();
        if (!finding.title.toLowerCase().includes(query)) {
          return false;
        }
      }

      if (findingFilters.scenarioId) {
        if (finding.session_scenario_id !== findingFilters.scenarioId) {
          return false;
        }
      }

      if (findingFilters.impact) {
        if (finding.impact !== findingFilters.impact) {
          return false;
        }
      }

      if (findingFilters.description.trim()) {
        const query = findingFilters.description.trim().toLowerCase();
        if (!(finding.description ?? "").toLowerCase().includes(query)) {
          return false;
        }
      }

      if (findingFilters.jiraKey.trim()) {
        const query = findingFilters.jiraKey.trim().toLowerCase();
        const rawKey = (finding.jira_key ?? "").toLowerCase();
        const detailKey = (jiraDetail?.jiraKey ?? "").toLowerCase();
        const isSemCardSearch =
          "sem card".includes(query) || query.includes("sem");
        const matchesKey =
          rawKey.includes(query) || detailKey.includes(query);
        const matchesSemCard =
          isSemCardSearch &&
          (!finding.jira_key || (jiraDetail && !jiraDetail.existsInJira));
        if (!matchesKey && !matchesSemCard) {
          return false;
        }
      }

      if (findingFilters.jiraStatus) {
        const st = (
          jiraDetail?.status ??
          finding.jira_status_cached ??
          ""
        ).toLowerCase();
        if (st !== findingFilters.jiraStatus.toLowerCase()) {
          return false;
        }
      }

      if (findingFilters.jiraSummary.trim()) {
        const query = findingFilters.jiraSummary.trim().toLowerCase();
        if (!(jiraDetail?.summary ?? "").toLowerCase().includes(query)) {
          return false;
        }
      }

      if (findingFilters.jiraAssignee) {
        const assignee = (
          jiraDetail?.assigneeDisplayName ?? ""
        ).toLowerCase();
        if (assignee !== findingFilters.jiraAssignee.toLowerCase()) {
          return false;
        }
      }

      if (findingFilters.foundBy) {
        if (finding.found_by_developer_id !== findingFilters.foundBy) {
          return false;
        }
      }

      return true;
    });
  }, [findings, jiraByFindingId, findingFilters]);

  useEffect(() => {
    if (findingState.success) {
      setFindingScenario(null);
    }
  }, [findingState.success]);

  function openFindingModal(scenario: StgSessionScenario) {
    if (!loggedInDeveloperId) {
      setFindingLinkError(
        "Seu login não está vinculado a um cadastro de pessoa. Peça para vincular o profile antes de registrar apontamentos.",
      );
      return;
    }
    setFindingLinkError(null);
    setFindingScenario(scenario);
  }

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
        <MetaCard label="Workflow" value={stgStatusLabel(session.status)} />
      </div>

      {!closed && canEdit ? (
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
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Cenários e execução</h2>
            <p className="text-sm text-muted-foreground">
              Expanda um cenário para marcar execuções. Use o ícone de
              apontamento no cabeçalho.
            </p>
          </div>
          <p className="text-xs tabular-nums text-muted-foreground">
            {includedScenarios.length} cenário(s) · {activeParticipantCount(participants)}{" "}
            participante(s)
          </p>
        </div>
        <FormFeedback error={runState.error} success={runState.success} />
        <FormFeedback error={findingState.error} success={findingState.success} />
        {findingLinkError ? (
          <p className="ui-alert-error" role="alert">
            {findingLinkError}
          </p>
        ) : null}
        {includedScenarios.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum cenário incluído.
          </p>
        ) : (
          <div className="space-y-2">
            {includedScenarios.map((scenario, index) => {
              const scenarioRuns = runs.filter(
                (run) => run.session_scenario_id === scenario.id,
              );
              const scenarioFindings = findings.filter(
                (row) => row.session_scenario_id === scenario.id,
              );
              const myScenarioFindings = loggedInDeveloperId
                ? scenarioFindings.filter(
                    (row) =>
                      row.found_by_developer_id === loggedInDeveloperId,
                  )
                : [];
              return (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  accentIndex={index}
                  runs={scenarioRuns}
                  findingCount={scenarioFindings.length}
                  scenarioFindings={scenarioFindings}
                  myFindings={myScenarioFindings}
                  showPendingHint={Boolean(loggedInDeveloperId) && !closed}
                  loggedInDeveloperId={loggedInDeveloperId}
                  closed={closed}
                  sessionId={session.id}
                  developerNames={developerNames}
                  runAction={runAction}
                  runPending={runPending}
                  onAddFinding={() => openFindingModal(scenario)}
                />
              );
            })}
          </div>
        )}
      </section>

      <section className="ui-dashboard-panel relative overflow-hidden p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Participantes</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                {participants.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Equipe escalada para a homologação desta versão.
            </p>
          </div>
        </div>

        {participants.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum participante configurado nesta sessão.
          </p>
        ) : (
          <div className="relative mt-2 flex flex-wrap items-start justify-center gap-6 px-2 py-4 sm:gap-8 sm:py-6">
            {participants.map((row, index) => {
              const fullName =
                developerNames[row.developer_id] ?? row.developer_id.slice(0, 8);
              const firstName = getFirstName(fullName);
              const avatarUrl = developerAvatarUrls[row.developer_id] ?? null;
              const isYou =
                loggedInDeveloperId !== null &&
                row.developer_id === loggedInDeveloperId;
              const config =
                PARTICIPATION_CONFIG[row.participation] ??
                PARTICIPATION_CONFIG.optional;

              const floatClass = FLOAT_CLASSES[index % FLOAT_CLASSES.length];
              const floatDelay = FLOAT_DELAYS[index % FLOAT_DELAYS.length];

              const participantRuns = runs.filter(
                (r) => r.developer_id === row.developer_id,
              );
              const doneCount = participantRuns.filter(
                (r) => r.status === "done",
              ).length;
              const totalCount = participantRuns.length;
              const progressText =
                totalCount > 0 ? ` · ${doneCount}/${totalCount} concluídos` : "";

              return (
                <div
                  key={row.id}
                  style={{ animationDelay: floatDelay }}
                  className={cn(
                    "ui-stg-floating-avatar group flex flex-col items-center gap-2 transition-transform duration-300 hover:scale-105 hover:z-20",
                    floatClass,
                  )}
                  title={`${fullName} (${config.label})${progressText}`}
                >
                  <div className="relative">
                    <div
                      className={cn(
                        "rounded-full p-1 transition-all duration-300",
                        isYou
                          ? "ring-2 ring-brand shadow-[0_0_14px_rgba(56,189,248,0.45)]"
                          : "ring-1 ring-border/80 group-hover:ring-brand/50 group-hover:shadow-[0_0_12px_rgba(56,189,248,0.25)]",
                      )}
                    >
                      <PersonAvatar
                        name={fullName}
                        src={avatarUrl}
                        size="xl"
                        className="size-14 border-0 shadow-inner sm:size-16"
                      />
                    </div>
                    {isYou ? (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full border border-brand/50 bg-brand px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider text-brand-foreground shadow-sm">
                        Você
                      </span>
                    ) : null}
                  </div>

                  <div className="flex flex-col items-center gap-1 text-center">
                    <p className="max-w-[100px] truncate text-xs font-semibold text-foreground tracking-tight sm:max-w-[115px]">
                      {firstName}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px]",
                        config.chipClass,
                      )}
                    >
                      {config.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Apontamentos</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">
                {hasActiveFindingFilters
                  ? `${filteredFindings.length} de ${findings.length}`
                  : findings.length}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              Crie pelo ícone em cada cenário. Lista abaixo para acompanhamento.
            </p>
          </div>
          {hasActiveFindingFilters ? (
            <button
              type="button"
              onClick={clearFindingFilters}
              className="ui-btn-secondary text-xs"
            >
              <RotateCcw className="size-3.5" strokeWidth={1.9} />
              <span>Limpar filtros</span>
            </button>
          ) : null}
        </div>
        <FormFeedback
          error={deleteFindingState.error}
          success={deleteFindingState.success}
        />
        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum apontamento nesta sessão.
          </p>
        ) : (
          <DataTable minWidthClassName="min-w-[1060px]">
            <thead>
              <tr>
                <th>Título</th>
                <th>Cenário</th>
                <th>Impacto</th>
                <th>Descrição</th>
                <th>Jira</th>
                <th>Status Jira</th>
                <th>Descrição Jira</th>
                <th>Responsável Jira</th>
                <th>Identificado por</th>
                <th className="w-16" />
              </tr>
              <tr className="border-b border-border/60 bg-muted/20">
                <th className="p-1 font-normal">
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    value={findingFilters.title}
                    onChange={(e) =>
                      setFindingFilters((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                    className="h-7 w-full min-w-[100px] rounded border border-border/70 bg-card/70 px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand/70 focus:outline-none"
                  />
                </th>
                <th className="p-1 font-normal">
                  <select
                    value={findingFilters.scenarioId}
                    onChange={(e) =>
                      setFindingFilters((prev) => ({
                        ...prev,
                        scenarioId: e.target.value,
                      }))
                    }
                    className="h-7 w-full min-w-[120px] rounded border border-border/70 bg-card/70 px-1.5 text-xs text-foreground focus:border-brand/70 focus:outline-none"
                  >
                    <option value="">Todos</option>
                    {uniqueScenarioIds.map((id) => (
                      <option key={id} value={id}>
                        {scenarioNameById[id] ?? id}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="p-1 font-normal">
                  <select
                    value={findingFilters.impact}
                    onChange={(e) =>
                      setFindingFilters((prev) => ({
                        ...prev,
                        impact: e.target.value,
                      }))
                    }
                    className="h-7 w-full min-w-[85px] rounded border border-border/70 bg-card/70 px-1.5 text-xs text-foreground focus:border-brand/70 focus:outline-none"
                  >
                    <option value="">Todos</option>
                    <option value="high">Alto</option>
                    <option value="medium">Médio</option>
                    <option value="low">Baixo</option>
                  </select>
                </th>
                <th className="p-1 font-normal">
                  <input
                    type="text"
                    placeholder="Filtrar..."
                    value={findingFilters.description}
                    onChange={(e) =>
                      setFindingFilters((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    className="h-7 w-full min-w-[110px] rounded border border-border/70 bg-card/70 px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand/70 focus:outline-none"
                  />
                </th>
                <th className="p-1 font-normal">
                  <input
                    type="text"
                    placeholder="Filtrar card..."
                    value={findingFilters.jiraKey}
                    onChange={(e) =>
                      setFindingFilters((prev) => ({
                        ...prev,
                        jiraKey: e.target.value,
                      }))
                    }
                    className="h-7 w-full min-w-[90px] rounded border border-border/70 bg-card/70 px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand/70 focus:outline-none"
                  />
                </th>
                <th className="p-1 font-normal">
                  <select
                    value={findingFilters.jiraStatus}
                    onChange={(e) =>
                      setFindingFilters((prev) => ({
                        ...prev,
                        jiraStatus: e.target.value,
                      }))
                    }
                    className="h-7 w-full min-w-[110px] rounded border border-border/70 bg-card/70 px-1.5 text-xs text-foreground focus:border-brand/70 focus:outline-none"
                  >
                    <option value="">Todos</option>
                    {uniqueJiraStatuses.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="p-1 font-normal">
                  <input
                    type="text"
                    placeholder="Filtrar resumo..."
                    value={findingFilters.jiraSummary}
                    onChange={(e) =>
                      setFindingFilters((prev) => ({
                        ...prev,
                        jiraSummary: e.target.value,
                      }))
                    }
                    className="h-7 w-full min-w-[110px] rounded border border-border/70 bg-card/70 px-2 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-brand/70 focus:outline-none"
                  />
                </th>
                <th className="p-1 font-normal">
                  <select
                    value={findingFilters.jiraAssignee}
                    onChange={(e) =>
                      setFindingFilters((prev) => ({
                        ...prev,
                        jiraAssignee: e.target.value,
                      }))
                    }
                    className="h-7 w-full min-w-[110px] rounded border border-border/70 bg-card/70 px-1.5 text-xs text-foreground focus:border-brand/70 focus:outline-none"
                  >
                    <option value="">Todos</option>
                    {uniqueJiraAssignees.map((assignee) => (
                      <option key={assignee} value={assignee}>
                        {assignee}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="p-1 font-normal">
                  <select
                    value={findingFilters.foundBy}
                    onChange={(e) =>
                      setFindingFilters((prev) => ({
                        ...prev,
                        foundBy: e.target.value,
                      }))
                    }
                    className="h-7 w-full min-w-[110px] rounded border border-border/70 bg-card/70 px-1.5 text-xs text-foreground focus:border-brand/70 focus:outline-none"
                  >
                    <option value="">Todos</option>
                    {uniqueFoundByIds.map((devId) => (
                      <option key={devId} value={devId}>
                        {developerNames[devId] ?? devId.slice(0, 8)}
                      </option>
                    ))}
                  </select>
                </th>
                <th className="p-1 text-right font-normal">
                  {hasActiveFindingFilters ? (
                    <button
                      type="button"
                      onClick={clearFindingFilters}
                      className="ui-btn-ghost h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      title="Limpar todos os filtros"
                    >
                      <RotateCcw className="size-3" strokeWidth={1.9} />
                      <span className="sr-only sm:not-sr-only">Limpar</span>
                    </button>
                  ) : null}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredFindings.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-8 text-center text-sm text-muted-foreground"
                  >
                    <p>
                      Nenhum apontamento encontrado para os filtros
                      selecionados.
                    </p>
                    <button
                      type="button"
                      onClick={clearFindingFilters}
                      className="ui-btn-secondary mt-2.5 inline-flex text-xs"
                    >
                      <RotateCcw className="size-3.5" strokeWidth={1.9} />
                      <span>Limpar filtros</span>
                    </button>
                  </td>
                </tr>
              ) : (
                filteredFindings.map((finding) => {
                  const jiraDetail = jiraByFindingId[finding.id];
                  const identifierName =
                    developerNames[finding.found_by_developer_id] ??
                    finding.found_by_developer_id.slice(0, 8);

                  return (
                    <tr key={finding.id}>
                      <td className="font-medium">{finding.title}</td>
                      <td className="text-muted-foreground">
                        {finding.session_scenario_id
                          ? (scenarioNameById[finding.session_scenario_id] ??
                            "—")
                          : "—"}
                      </td>
                      <td>
                        <ImpactPill impact={finding.impact} />
                      </td>
                      <td className="max-w-[260px] text-xs text-muted-foreground">
                        <p
                          className="line-clamp-2"
                          title={finding.description ?? ""}
                        >
                          {finding.description || "—"}
                        </p>
                      </td>
                      <td>
                        <JiraKeyCell
                          jiraDetail={jiraDetail}
                          rawKey={finding.jira_key}
                        />
                      </td>
                      <td>
                        <JiraStatusPill
                          status={
                            jiraDetail?.status ??
                            finding.jira_status_cached ??
                            null
                          }
                        />
                      </td>
                      <td className="max-w-[240px] text-xs text-muted-foreground">
                        <p
                          className="line-clamp-2"
                          title={jiraDetail?.summary ?? ""}
                        >
                          {jiraDetail?.summary || "—"}
                        </p>
                      </td>
                      <td className="text-xs text-foreground">
                        {jiraDetail?.assigneeDisplayName || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="text-xs">
                        <span className="font-medium text-foreground">
                          {identifierName}
                        </span>
                      </td>
                      <td className="text-right">
                        {!closed && canDelete ? (
                          <form action={deleteFindingAction}>
                            <input
                              type="hidden"
                              name="findingId"
                              value={finding.id}
                            />
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
                  );
                })
              )}
            </tbody>
          </DataTable>
        )}
      </section>

      {session.result === "blocked" && !closed && canEdit ? (
        <section className="ui-dashboard-panel space-y-3">
          <h2 className="text-base font-semibold">Decisão / waiver</h2>
          <p className="text-sm text-muted-foreground">
            Liberar produção apesar dos blockers grava result=waived (não
            approved), com motivo obrigatório.
          </p>
          <form action={waiveAction} className="space-y-3">
            <input type="hidden" name="sessionId" value={session.id} />
            <FormField label="Motivo do waiver" htmlFor="reason">
              <textarea
                id="reason"
                name="reason"
                required
                rows={2}
                className="ui-input"
              />
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

      {canDelete ? (
        <section className="ui-dashboard-panel space-y-3">
          <h2 className="text-base font-semibold">Excluir sessão</h2>
          <p className="text-sm text-muted-foreground">
            Remove permanentemente esta sessão, cenários, execuções e
            apontamentos. Libera o par data + versão para uma nova abertura.
          </p>
          <FormFeedback
            error={deleteSessionState.error}
            success={deleteSessionState.success}
          />
          <DestructiveAction
            formAction={deleteSessionAction}
            variant="panel"
            label="Excluir sessão"
            confirmLabel="Confirmar exclusão"
            loadingLabel="Excluindo..."
            pending={deleteSessionPending}
            description={`Exclui “${session.scheduled_on} · ${session.version_label}” sem possibilidade de desfazer.`}
          >
            <input type="hidden" name="sessionId" value={session.id} />
          </DestructiveAction>
        </section>
      ) : null}

      {canEdit ? (
        <p className="text-xs text-muted-foreground">
          Status Jira vem do sync + mapeamento{" "}
          <Link href="/app/jira" className="underline">
            status_groups
          </Link>
          . A política STG usa apenas grupos semânticos.
        </p>
      ) : null}

      {findingScenario && loggedInDeveloperId ? (
        <FindingModal
          sessionId={session.id}
          scenario={findingScenario}
          foundByDeveloperId={loggedInDeveloperId}
          foundByLabel={
            loggedInDeveloperName ?? loggedInDeveloperId.slice(0, 8)
          }
          formAction={findingAction}
          pending={findingPending}
          error={findingState.error}
          onClose={() => setFindingScenario(null)}
        />
      ) : null}
    </div>
  );
}

function activeParticipantCount(
  participants: StgSessionDetail["participants"],
): number {
  return participants.filter((row) => row.participation !== "excluded").length;
}

const SCENARIO_ACCENTS = [
  {
    bar: "bg-cyan-500",
    progress: "bg-cyan-500",
    chip: "bg-cyan-500/15 text-cyan-800 dark:text-cyan-200",
  },
  {
    bar: "bg-sky-500",
    progress: "bg-sky-500",
    chip: "bg-sky-500/15 text-sky-800 dark:text-sky-200",
  },
  {
    bar: "bg-emerald-500",
    progress: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
  },
  {
    bar: "bg-amber-500",
    progress: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-900 dark:text-amber-200",
  },
  {
    bar: "bg-orange-500",
    progress: "bg-orange-500",
    chip: "bg-orange-500/15 text-orange-900 dark:text-orange-200",
  },
  {
    bar: "bg-rose-500",
    progress: "bg-rose-500",
    chip: "bg-rose-500/15 text-rose-800 dark:text-rose-200",
  },
  {
    bar: "bg-violet-500",
    progress: "bg-violet-500",
    chip: "bg-violet-500/15 text-violet-800 dark:text-violet-200",
  },
  {
    bar: "bg-teal-500",
    progress: "bg-teal-500",
    chip: "bg-teal-500/15 text-teal-800 dark:text-teal-200",
  },
] as const;

function scenarioAccent(index: number) {
  return SCENARIO_ACCENTS[index % SCENARIO_ACCENTS.length]!;
}

function countFindingsByImpact(findings: StgFinding[]): Record<
  StgFindingImpact,
  number
> {
  const counts: Record<StgFindingImpact, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const finding of findings) {
    counts[finding.impact] += 1;
  }
  return counts;
}

function ImpactPill({ impact }: { impact: StgFindingImpact }) {
  const meta: Record<
    StgFindingImpact,
    { label: string; dot: string; glow: string; text: string; bg: string; border: string }
  > = {
    low: {
      label: "Baixo",
      dot: "bg-emerald-500",
      glow: "shadow-[0_0_6px_rgba(16,185,129,0.7)]",
      text: "text-emerald-300",
      bg: "bg-emerald-500/15",
      border: "border-emerald-500/40",
    },
    medium: {
      label: "Médio",
      dot: "bg-amber-400",
      glow: "shadow-[0_0_6px_rgba(251,191,36,0.7)]",
      text: "text-amber-200",
      bg: "bg-amber-400/15",
      border: "border-amber-400/40",
    },
    high: {
      label: "Alto",
      dot: "bg-rose-500",
      glow: "shadow-[0_0_6px_rgba(244,63,94,0.7)]",
      text: "text-rose-200",
      bg: "bg-rose-500/15",
      border: "border-rose-500/40",
    },
  };

  const item = meta[impact];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold tracking-wide",
        item.bg,
        item.border,
        item.text,
      )}
    >
      <span
        className={cn("size-2 shrink-0 rounded-full", item.dot, item.glow)}
        aria-hidden
      />
      <span>{item.label}</span>
    </span>
  );
}

function JiraStatusPill({ status }: { status: string | null }) {
  if (!status) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <span className="inline-flex items-center rounded-[var(--radius-sm)] border border-border/70 bg-card/70 px-2 py-0.5 text-xs font-medium text-foreground">
      {status}
    </span>
  );
}

function JiraKeyCell({
  jiraDetail,
  rawKey,
}: {
  jiraDetail?: StgFindingJiraDetail;
  rawKey: string | null;
}) {
  const key = rawKey?.trim() || jiraDetail?.jiraKey?.trim();

  if (!key) {
    return (
      <span className="ui-stg-finding-pending">
        <AlertCircle className="size-3.5" strokeWidth={2} aria-hidden />
        <span>SEM CARD</span>
      </span>
    );
  }

  if (jiraDetail && !jiraDetail.existsInJira) {
    return (
      <span
        className="ui-stg-finding-pending"
        title={`O card ${key} informado não foi localizado no Jira`}
      >
        <AlertCircle className="size-3.5" strokeWidth={2} aria-hidden />
        <span>SEM CARD ({key})</span>
      </span>
    );
  }

  return (
    <span className="font-mono text-xs font-semibold text-foreground">
      {key}
    </span>
  );
}

const IMPACT_LABEL: Record<StgFindingImpact, string> = {
  high: "alto",
  medium: "médio",
  low: "baixo",
};

const IMPACT_COUNT_CLASS: Record<StgFindingImpact, string> = {
  high: "text-danger",
  medium: "text-warning",
  low: "text-muted-foreground",
};

function FindingsImpactCounts({ findings }: { findings: StgFinding[] }) {
  const counts = countFindingsByImpact(findings);
  return (
    <span className="inline-flex items-center gap-1.5 font-medium tabular-nums">
      {(["high", "medium", "low"] as const).map((impact) =>
        counts[impact] > 0 ? (
          <span key={impact} className={IMPACT_COUNT_CLASS[impact]}>
            {counts[impact]}
          </span>
        ) : null,
      )}
    </span>
  );
}

function findingsSummaryLabel(findings: StgFinding[]): string {
  const counts = countFindingsByImpact(findings);
  const parts = (["high", "medium", "low"] as const)
    .filter((impact) => counts[impact] > 0)
    .map((impact) => `${counts[impact]} ${IMPACT_LABEL[impact]}`);
  return parts.length > 0 ? parts.join(", ") : "nenhum";
}

function ScenarioFindingsBadge({
  findings,
  variant,
}: {
  findings: StgFinding[];
  variant: "self-header" | "self-row" | "participant";
}) {
  if (findings.length === 0) {
    if (variant === "self-header") {
      return (
        <span
          className="ui-stg-finding-pending"
          title="Você ainda não apontou neste cenário"
          aria-label="Você ainda não apontou neste cenário"
        >
          <AlertCircle className="size-3.5" strokeWidth={2} aria-hidden />
          <span className="hidden sm:inline">Sem apontamento</span>
        </span>
      );
    }
    if (variant === "self-row") {
      return (
        <span className="text-xs text-danger">Sem apontamento</span>
      );
    }
    return (
      <span className="text-xs text-muted-foreground">Sem apontamento</span>
    );
  }

  const label =
    variant === "participant"
      ? `Apontamentos: ${findingsSummaryLabel(findings)}`
      : `Seus apontamentos: ${findingsSummaryLabel(findings)}`;

  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums"
      title={label}
      aria-label={label}
    >
      <ClipboardList
        className="size-3 text-muted-foreground"
        strokeWidth={1.9}
        aria-hidden
      />
      <FindingsImpactCounts findings={findings} />
      <span className="hidden text-muted-foreground sm:inline">
        apont.
      </span>
    </span>
  );
}

function MyFindingsBadge({
  findings,
  showPendingHint,
}: {
  findings: StgFinding[];
  showPendingHint: boolean;
}) {
  if (findings.length === 0 && !showPendingHint) return null;
  return (
    <ScenarioFindingsBadge
      findings={findings}
      variant="self-header"
    />
  );
}

function ScenarioCard({
  scenario,
  accentIndex,
  runs,
  findingCount,
  scenarioFindings,
  myFindings,
  showPendingHint,
  loggedInDeveloperId,
  closed,
  sessionId,
  developerNames,
  runAction,
  runPending,
  onAddFinding,
}: {
  scenario: StgSessionScenario;
  accentIndex: number;
  runs: StgScenarioRun[];
  findingCount: number;
  scenarioFindings: StgFinding[];
  myFindings: StgFinding[];
  showPendingHint: boolean;
  loggedInDeveloperId: string | null;
  closed: boolean;
  sessionId: string;
  developerNames: Record<string, string>;
  runAction: (payload: FormData) => void;
  runPending: boolean;
  onAddFinding: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const accent = scenarioAccent(accentIndex);
  const done = runs.filter((run) => run.status === "done").length;
  const total = runs.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="ui-dashboard-panel relative space-y-2 overflow-hidden">
      <span
        className={cn("absolute inset-y-0 left-0 w-1.5", accent.bar)}
        aria-hidden
      />
      <div className="flex flex-wrap items-start gap-2 pl-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-start gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 text-left transition-colors hover:bg-background/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
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
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p
                  className={cn(
                    "inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                    accent.chip,
                  )}
                >
                  {scenario.module_name}
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {scenario.scenario_name}
                </p>
              </div>
              <p className="text-xs tabular-nums text-muted-foreground">
                {done}/{total} · {progress}%
                {findingCount > 0 ? ` · ${findingCount} apont.` : ""}
              </p>
            </div>
            {scenario.summary ? (
              <p className="text-sm text-muted-foreground">{scenario.summary}</p>
            ) : null}
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              aria-hidden
            >
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-200",
                  progress === 100 ? "bg-success" : accent.progress,
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </button>
        <MyFindingsBadge
          findings={myFindings}
          showPendingHint={showPendingHint}
        />
        {!closed ? (
          <button
            type="button"
            className="ui-btn-ghost shrink-0"
            onClick={onAddFinding}
            title="Novo apontamento neste cenário"
            aria-label={`Novo apontamento em ${scenario.scenario_name}`}
          >
            <NotebookPen className="size-4" strokeWidth={1.9} />
            <span className="hidden sm:inline">Apontar</span>
          </button>
        ) : null}
      </div>

      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "space-y-2 border-t border-border/50 pt-2 pl-1",
          !open && "hidden",
        )}
      >
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma execução materializada.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {runs.map((run) => {
              const isOwnRun =
                loggedInDeveloperId !== null &&
                run.developer_id === loggedInDeveloperId;
              const participantFindings = scenarioFindings.filter(
                (row) => row.found_by_developer_id === run.developer_id,
              );
              return (
                <li
                  key={run.id}
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm",
                    isOwnRun && "bg-brand/5 ring-1 ring-brand/15",
                  )}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {developerNames[run.developer_id] ??
                        run.developer_id.slice(0, 8)}
                      {isOwnRun ? (
                        <span className="ml-1.5 text-xs font-normal text-brand">
                          (você)
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {run.status}
                    </span>
                    <ScenarioFindingsBadge
                      findings={participantFindings}
                      variant={isOwnRun ? "self-row" : "participant"}
                    />
                  </div>
                  {!closed && isOwnRun ? (
                    <form action={runAction} className="flex gap-1">
                      <input type="hidden" name="runId" value={run.id} />
                      <input type="hidden" name="sessionId" value={sessionId} />
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
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FindingModal({
  sessionId,
  scenario,
  foundByDeveloperId,
  foundByLabel,
  formAction,
  pending,
  error,
  onClose,
}: {
  sessionId: string;
  scenario: StgSessionScenario;
  foundByDeveloperId: string;
  foundByLabel: string;
  formAction: (payload: FormData) => void;
  pending: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [selectedImpact, setSelectedImpact] =
    useState<StgFindingImpact>("medium");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!mounted) {
    return null;
  }

  const impactOptions: Array<{
    value: StgFindingImpact;
    label: string;
    dotClass: string;
    activeClass: string;
    glowClass: string;
  }> = [
    {
      value: "low",
      label: "Baixo",
      dotClass: "bg-emerald-500",
      glowClass: "shadow-[0_0_8px_rgba(16,185,129,0.7)]",
      activeClass:
        "border-emerald-500/70 bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]",
    },
    {
      value: "medium",
      label: "Médio",
      dotClass: "bg-amber-400",
      glowClass: "shadow-[0_0_8px_rgba(251,191,36,0.7)]",
      activeClass:
        "border-amber-400/70 bg-amber-400/20 text-amber-200 ring-1 ring-amber-400/50 shadow-[0_0_12px_rgba(251,191,36,0.2)]",
    },
    {
      value: "high",
      label: "Alto",
      dotClass: "bg-rose-500",
      glowClass: "shadow-[0_0_8px_rgba(244,63,94,0.7)]",
      activeClass:
        "border-rose-500/70 bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/50 shadow-[0_0_12px_rgba(244,63,94,0.2)]",
    },
  ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(90dvh,100%)] w-full min-w-0 max-w-lg flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-t-[var(--radius)] border border-border bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-md)] sm:rounded-[var(--radius)] sm:p-5"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Novo apontamento
            </p>
            <h2
              id={titleId}
              className="truncate text-base font-semibold tracking-tight"
            >
              {scenario.module_name} · {scenario.scenario_name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Identificado por {foundByLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>
        </div>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="sessionId" value={sessionId} />
          <input
            type="hidden"
            name="sessionScenarioId"
            value={scenario.id}
          />
          <input
            type="hidden"
            name="foundByDeveloperId"
            value={foundByDeveloperId}
          />
          <input type="hidden" name="impact" value={selectedImpact} />

          <FormField label="Título" htmlFor={`${titleId}-title`}>
            <input
              id={`${titleId}-title`}
              name="title"
              required
              className="ui-input"
              autoFocus
            />
          </FormField>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Impacto
            </label>
            <div
              role="radiogroup"
              aria-label="Impacto"
              className="grid grid-cols-3 gap-2"
            >
              {impactOptions.map((opt) => {
                const isSelected = selectedImpact === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelectedImpact(opt.value)}
                    className={cn(
                      "group relative flex items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-border/70 bg-card/60 px-3 py-2 text-xs font-semibold text-muted-foreground transition-all duration-200 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 active:scale-[0.98]",
                      isSelected && opt.activeClass,
                    )}
                  >
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full transition-transform duration-200",
                        opt.dotClass,
                        isSelected && [
                          "ui-stg-traffic-active-dot",
                          opt.glowClass,
                        ],
                      )}
                      aria-hidden
                    />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <FormField
            label="Card Jira"
            htmlFor={`${titleId}-jira`}
          >
            <input
              id={`${titleId}-jira`}
              name="jiraKey"
              required
              className="ui-input"
              placeholder="AP-1234"
            />
          </FormField>

          <FormField label="Descrição" htmlFor={`${titleId}-description`}>
            <textarea
              id={`${titleId}-description`}
              name="description"
              required
              rows={3}
              className="ui-input"
            />
          </FormField>
          {error ? (
            <p className="text-sm text-danger text-pretty">{error}</p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn-secondary w-full sm:w-auto"
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="ui-btn-primary w-full sm:w-auto"
              disabled={pending}
            >
              {pending ? "Salvando..." : "Salvar apontamento"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
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
