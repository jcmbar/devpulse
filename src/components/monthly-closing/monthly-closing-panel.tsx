"use client";

import {
  startMonthlyClosingAction,
  submitMonthlyClosingAction,
} from "@/app/app/monthly-closing-actions";
import {
  ClosingSubmitValuesModal,
  type ClosingSubmitValuesPayload,
} from "@/components/monthly-closing/closing-submit-values-modal";
import { DataTable } from "@/components/surface";
import { SectionShell } from "@/components/ui/section-shell";
import { cn } from "@/lib/utils";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import type { DeveloperCompensation } from "@/types/developer-compensation";
import type {
  MonthlyClosing,
  MonthlyClosingCardAuditRow,
  MonthlyClosingStatus,
} from "@/types/monthly-closing";
import { monthlyClosingStatusLabel } from "@/types/monthly-closing";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function MonthlyClosingStatusBadge({
  status,
  className,
}: {
  status: MonthlyClosingStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-sm)] border px-2.5 py-1 text-xs font-semibold tracking-wide",
        status === "open" &&
          "border-sky-500/40 bg-sky-500/15 text-sky-950 dark:text-sky-100",
        status === "in_review" &&
          "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100",
        status === "rejected" &&
          "border-rose-500/45 bg-rose-500/15 text-rose-950 dark:text-rose-100",
        status === "closed" &&
          "border-violet-500/40 bg-violet-500/15 text-violet-950 dark:text-violet-100",
        status === "finalized" &&
          "border-emerald-500/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100",
        className,
      )}
    >
      {monthlyClosingStatusLabel(status)}
    </span>
  );
}

function formatHours(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} h`;
}

function formatDays(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} d`;
}

function JustificationCell({
  label,
  applicable,
  status,
  developerNote,
  managerNote,
}: {
  label: string;
  applicable: boolean;
  status: "pending" | "accepted" | "rejected" | null;
  developerNote: string | null;
  managerNote: string | null;
}) {
  if (!applicable) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const statusLabel =
    status === "accepted"
      ? "Aceito"
      : status === "rejected"
        ? "Recusado"
        : status === "pending"
          ? "Pendente"
          : "Ausente";

  return (
    <div className="min-w-[9rem] space-y-1 text-xs">
      <p className="font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <span
        className={cn(
          "inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold",
          status === "accepted" &&
            "border-emerald-500/40 bg-emerald-500/15 text-emerald-950 dark:text-emerald-100",
          status === "rejected" &&
            "border-rose-500/40 bg-rose-500/15 text-rose-950 dark:text-rose-100",
          status === "pending" &&
            "border-amber-500/40 bg-amber-500/15 text-amber-950 dark:text-amber-100",
          status == null && "border-border bg-muted/40 text-muted-foreground",
        )}
      >
        {statusLabel}
      </span>
      {developerNote ? (
        <p className="line-clamp-2 text-muted-foreground" title={developerNote}>
          Dev: {developerNote}
        </p>
      ) : null}
      {managerNote ? (
        <p className="line-clamp-2 text-muted-foreground" title={managerNote}>
          Gestor: {managerNote}
        </p>
      ) : null}
    </div>
  );
}

type MonthlyClosingControlsProps = {
  yearMonth: string | null;
  importId: string | null;
  sourceMode?: string | null;
  closing: MonthlyClosing | null;
  canSubmit: boolean;
  blockingCount: number;
  compensation: DeveloperCompensation | null;
  workedHours: number;
};

export function MonthlyClosingControls({
  yearMonth,
  importId,
  sourceMode = "auto",
  closing,
  canSubmit,
  blockingCount,
  compensation,
  workedHours,
}: MonthlyClosingControlsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [resubmissionNotes, setResubmissionNotes] = useState("");
  const [valuesModalOpen, setValuesModalOpen] = useState(false);
  const [valuesModalMode, setValuesModalMode] = useState<"submit" | "resubmit">(
    "submit",
  );
  const [pending, startTransition] = useTransition();
  const status: MonthlyClosingStatus = closing?.status ?? "open";
  const started = closing != null && closing.started_at != null;

  if (!yearMonth) {
    return (
      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        <MonthlyClosingStatusBadge status="open" />
        <p className="max-w-[16rem] text-xs text-muted-foreground text-pretty sm:text-right">
          Selecione um mês/ano para gerenciar o fechamento.
        </p>
      </div>
    );
  }

  function startClosing() {
    setError(null);
    startTransition(async () => {
      const result = await startMonthlyClosingAction({
        yearMonth: yearMonth!,
        importId,
        sourceMode,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function openValuesModal(mode: "submit" | "resubmit") {
    if (!compensation) {
      setError(
        "Cadastro de valores (compensação) não encontrado. Peça ao gestor para configurar em Developers.",
      );
      return;
    }
    setError(null);
    setValuesModalMode(mode);
    setValuesModalOpen(true);
  }

  function submitWithValues(payload: ClosingSubmitValuesPayload) {
    if (!closing || !importId || !compensation) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await submitMonthlyClosingAction({
        closingId: closing.id,
        importId,
        sourceMode,
        developerResubmissionNotes:
          valuesModalMode === "resubmit" ? resubmissionNotes : undefined,
        travelDays: payload.travelDays,
        mealDays: payload.mealDays,
        valuesNotes: payload.valuesNotes,
        workedHours,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setResubmissionNotes("");
      setValuesModalOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-2 lg:max-w-none lg:items-end">
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
        <MonthlyClosingStatusBadge status={status} />
        <span className="text-xs text-muted-foreground">
          {formatYearMonthLabel(yearMonth)}
        </span>
      </div>

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start lg:justify-end">
        {status === "open" && !started ? (
          <button
            type="button"
            onClick={startClosing}
            disabled={pending || !importId}
            className="ui-btn-primary"
            title={
              !importId
                ? "É necessário um lote Compilado resolvido"
                : undefined
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Iniciar fechamento
          </button>
        ) : null}

        {status === "open" && started ? (
          <button
            type="button"
            onClick={() => openValuesModal("submit")}
            disabled={pending || !canSubmit || !importId}
            className="ui-btn-primary"
            title={
              !canSubmit
                ? "Todas as justificativas de atraso/retrabalho precisam estar aceitas ou recusadas"
                : undefined
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Enviar para aprovação
          </button>
        ) : null}

        {status === "rejected" && closing ? (
          <div className="w-full space-y-2 rounded-[var(--radius-sm)] border border-rose-500/40 bg-rose-500/10 p-3 text-left">
            <p className="text-sm font-semibold text-rose-950 dark:text-rose-100">
              Fechamento devolvido pelo gestor
            </p>
            <p className="text-xs text-muted-foreground">
              Ajuste o necessário (inclusive no Jira, se precisar) e reenvie com
              uma resposta.
            </p>
            {closing.manager_rejection_notes ? (
              <div className="rounded-[var(--radius-sm)] border border-border bg-[var(--surface)] px-2.5 py-2">
                <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                  Observação do gestor
                </p>
                <p className="mt-1 text-sm text-pretty whitespace-pre-wrap">
                  {closing.manager_rejection_notes}
                </p>
                {closing.manager_rejected_at ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(closing.manager_rejected_at).toLocaleString(
                      "pt-BR",
                    )}
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => openValuesModal("resubmit")}
              disabled={pending || !canSubmit || !importId}
              className="ui-btn-primary w-full sm:w-auto"
              title={
                !canSubmit
                  ? "Todas as justificativas de atraso/retrabalho precisam estar aceitas ou recusadas"
                  : undefined
              }
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Reenviar para análise
            </button>
          </div>
        ) : null}

        {(status === "open" || status === "rejected") &&
        started &&
        blockingCount > 0 ? (
          <p className="max-w-[18rem] text-xs text-warning text-pretty sm:text-right">
            {blockingCount} card(s) bloqueiam o envio.
          </p>
        ) : null}

        {status === "in_review" ? (
          <p className="max-w-[18rem] text-xs text-muted-foreground text-pretty sm:text-right">
            Enviado ao gestor · snapshot congelado.
          </p>
        ) : null}

        {status === "closed" ? (
          <p className="max-w-[18rem] text-xs text-muted-foreground text-pretty sm:text-right">
            Aprovado · envie NF e boleto em PDF.
          </p>
        ) : null}

        {status === "finalized" ? (
          <p className="max-w-[18rem] text-xs text-muted-foreground text-pretty sm:text-right">
            Finalizado · somente leitura.
          </p>
        ) : null}

        {error ? (
          <p className="max-w-[18rem] text-xs text-danger text-pretty sm:text-right">
            {error}
          </p>
        ) : null}
      </div>

      {compensation ? (
        <ClosingSubmitValuesModal
          open={valuesModalOpen}
          onClose={() => {
            if (!pending) {
              setValuesModalOpen(false);
            }
          }}
          onConfirm={submitWithValues}
          pending={pending}
          yearMonth={yearMonth}
          compensation={compensation}
          workedHours={workedHours}
          requireResubmissionNotes={valuesModalMode === "resubmit"}
          resubmissionNotes={resubmissionNotes}
          onResubmissionNotesChange={setResubmissionNotes}
          title={
            valuesModalMode === "resubmit"
              ? "Reenviar com valores do fechamento"
              : "Informar valores do fechamento"
          }
          confirmLabel={
            valuesModalMode === "resubmit"
              ? "Confirmar e reenviar"
              : "Confirmar e enviar"
          }
        />
      ) : null}
    </div>
  );
}

type MonthlyClosingAuditSectionProps = {
  closing: MonthlyClosing | null;
  auditRows: MonthlyClosingCardAuditRow[];
};

export function MonthlyClosingAuditSection({
  closing,
  auditRows,
}: MonthlyClosingAuditSectionProps) {
  const started = closing != null && closing.started_at != null;
  if (!started) {
    return null;
  }

  const status = closing.status;
  const show =
    status === "open" ||
    status === "rejected" ||
    status === "in_review" ||
    status === "closed" ||
    status === "finalized";
  if (!show) {
    return null;
  }

  return (
    <SectionShell
      title="Auditoria do fechamento"
      description={
        status === "open" || status === "rejected"
          ? "Revise os cards entregues no mês. Após ajustes (inclusive no Jira), reenvie ao gestor."
          : "Base congelada no envio ao gestor (snapshot)."
      }
    >
      {auditRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum card com Entrega TU neste mês.
        </p>
      ) : (
        <DataTable minWidthClassName="min-w-[1100px]" stickyFirstColumn>
          <thead>
            <tr>
              <th>Chave</th>
              <th>Resumo</th>
              <th className="hidden lg:table-cell">Status</th>
              <th className="hidden md:table-cell">Previsto</th>
              <th className="hidden md:table-cell">Realizado</th>
              <th>Atraso</th>
              <th>Retrabalho</th>
              <th className="hidden lg:table-cell">Prazo</th>
              <th className="hidden lg:table-cell">Entrega TU</th>
              <th>Justificativas</th>
            </tr>
          </thead>
          <tbody>
            {auditRows.map((row) => (
              <tr
                key={row.cardId}
                className={cn(row.blocksSubmit && "bg-warning/5")}
              >
                <td className="whitespace-nowrap font-mono font-medium">
                  {row.jiraKey}
                </td>
                <td className="max-w-[12rem] truncate sm:max-w-[16rem]">
                  {row.summary ?? "—"}
                </td>
                <td className="hidden whitespace-nowrap lg:table-cell">
                  {row.status ?? "—"}
                </td>
                <td className="hidden whitespace-nowrap md:table-cell">
                  {formatHours(row.estimateHours)}
                </td>
                <td className="hidden whitespace-nowrap md:table-cell">
                  {formatHours(row.actualHours)}
                </td>
                <td className="whitespace-nowrap">
                  {row.isDelayed ? formatDays(row.delayDays) : "—"}
                </td>
                <td className="whitespace-nowrap">
                  {row.isRework
                    ? row.reworkWeight > 1
                      ? `${row.reworkWeight}x`
                      : "Sim"
                    : "—"}
                </td>
                <td className="hidden whitespace-nowrap lg:table-cell">
                  {row.dueOn ?? "—"}
                </td>
                <td className="hidden whitespace-nowrap lg:table-cell">
                  {row.unitTestDeliveryOn ?? "—"}
                </td>
                <td className="align-top">
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <JustificationCell
                      label="Atraso"
                      applicable={row.isDelayed}
                      status={row.delayJustification.status}
                      developerNote={row.delayJustification.developerNote}
                      managerNote={row.delayJustification.managerNote}
                    />
                    <JustificationCell
                      label="Retrabalho"
                      applicable={row.isRework}
                      status={row.reworkJustification.status}
                      developerNote={row.reworkJustification.developerNote}
                      managerNote={row.reworkJustification.managerNote}
                    />
                  </div>
                  {row.blockReasons.length > 0 ? (
                    <ul className="mt-2 list-inside list-disc text-[11px] text-warning">
                      {row.blockReasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </SectionShell>
  );
}
