"use client";

import {
  saveMonthlyClosingDraftAction,
  startMonthlyClosingAction,
  submitMonthlyClosingAction,
} from "@/app/app/monthly-closing-actions";
import {
  ClosingSubmitValuesModal,
  type ClosingSubmitValuesPayload,
} from "@/components/monthly-closing/closing-submit-values-modal";
import { DataTable } from "@/components/surface";
import { SectionShell } from "@/components/ui/section-shell";
import { formatDateTimeBrazil } from "@/lib/datetime/format-brazil";
import { cn } from "@/lib/utils";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import type { DeveloperCompensation } from "@/types/developer-compensation";
import type {
  MonthlyClosing,
  MonthlyClosingCardAuditRow,
  MonthlyClosingPresenceDay,
  MonthlyClosingStatus,
} from "@/types/monthly-closing";
import { monthlyClosingStatusLabel } from "@/types/monthly-closing";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

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
  holidays?: ReadonlyArray<{ date: string; name: string }>;
  presenceDays?: ReadonlyArray<MonthlyClosingPresenceDay>;
  /** Bloqueia iniciar/enviar até comprovante PIX aceito. */
  mealPixBlockReason?: string | null;
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
  holidays = [],
  presenceDays = [],
  mealPixBlockReason = null,
}: MonthlyClosingControlsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resubmissionNotes, setResubmissionNotes] = useState("");
  const [valuesModalOpen, setValuesModalOpen] = useState(false);
  const [valuesModalMode, setValuesModalMode] = useState<"submit" | "resubmit">(
    "submit",
  );
  const [pending, startTransition] = useTransition();
  const [draftTravelDays, setDraftTravelDays] = useState<string[] | null>(null);
  const [draftMealDays, setDraftMealDays] = useState<string[] | null>(null);
  const [draftAbsenceDays, setDraftAbsenceDays] = useState<string[] | null>(
    null,
  );
  const [draftMakeupDays, setDraftMakeupDays] = useState<string[] | null>(null);
  const [draftValuesNotes, setDraftValuesNotes] = useState<string | null>(null);
  const status: MonthlyClosingStatus = closing?.status ?? "open";
  const started = closing != null && closing.started_at != null;
  const mealPixBlocked = Boolean(mealPixBlockReason);

  const presenceTravelDays = useMemo(
    () =>
      presenceDays
        .filter((row) => row.kind === "travel")
        .map((row) => row.day_on),
    [presenceDays],
  );
  const presenceMealDays = useMemo(
    () =>
      presenceDays
        .filter((row) => row.kind === "meal")
        .map((row) => row.day_on),
    [presenceDays],
  );
  const presenceAbsenceDays = useMemo(
    () =>
      presenceDays
        .filter((row) => row.kind === "absence")
        .map((row) => row.day_on),
    [presenceDays],
  );
  const presenceMakeupDays = useMemo(
    () =>
      presenceDays
        .filter((row) => row.kind === "makeup")
        .map((row) => row.day_on),
    [presenceDays],
  );

  const initialTravelDays = draftTravelDays ?? presenceTravelDays;
  const initialMealDays = draftMealDays ?? presenceMealDays;
  const initialAbsenceDays = draftAbsenceDays ?? presenceAbsenceDays;
  const initialMakeupDays = draftMakeupDays ?? presenceMakeupDays;
  const initialValuesNotes =
    draftValuesNotes ?? closing?.developer_values_notes ?? null;

  useEffect(() => {
    setDraftTravelDays(null);
    setDraftMealDays(null);
    setDraftAbsenceDays(null);
    setDraftMakeupDays(null);
    setDraftValuesNotes(null);
  }, [closing?.id]);

  const confirmBlockedReason = mealPixBlocked
    ? mealPixBlockReason
    : !canSubmit
      ? blockingCount > 0
        ? `Ainda há ${blockingCount} card(s) com justificativa pendente. Você pode salvar o rascunho e enviar depois.`
        : "Aguarde as justificativas antes de enviar ao gestor. Você pode salvar o rascunho."
      : !importId
        ? "É necessário um lote Compilado resolvido."
        : null;

  const canConfirmSubmit = canSubmit && Boolean(importId) && !mealPixBlocked;

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
    setInfo(null);
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
    setInfo(null);
    setValuesModalMode(mode);
    setValuesModalOpen(true);
  }

  function submitWithValues(payload: ClosingSubmitValuesPayload) {
    if (!closing || !importId || !compensation) {
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await submitMonthlyClosingAction({
        closingId: closing.id,
        importId,
        sourceMode,
        developerResubmissionNotes:
          valuesModalMode === "resubmit" ? resubmissionNotes : undefined,
        travelDays: payload.travelDays,
        mealDays: payload.mealDays,
        absenceDays: payload.absenceDays,
        makeupDays: payload.makeupDays,
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

  function saveDraftValues(payload: ClosingSubmitValuesPayload) {
    if (!closing || !compensation) {
      return;
    }
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const result = await saveMonthlyClosingDraftAction({
        closingId: closing.id,
        travelDays: payload.travelDays,
        mealDays: payload.mealDays,
        absenceDays: payload.absenceDays,
        makeupDays: payload.makeupDays,
        valuesNotes: payload.valuesNotes,
        workedHours,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraftTravelDays(payload.travelDays);
      setDraftMealDays(payload.mealDays);
      setDraftAbsenceDays(payload.absenceDays);
      setDraftMakeupDays(payload.makeupDays);
      setDraftValuesNotes(payload.valuesNotes);
      setInfo("Rascunho salvo. Você pode continuar depois.");
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

      {mealPixBlockReason ? (
        <div className="w-full rounded-[var(--radius-sm)] border border-amber-500/50 bg-amber-500/15 px-3 py-2 text-left text-xs text-amber-950 dark:text-amber-100 text-pretty">
          {mealPixBlockReason}
        </div>
      ) : null}

      <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start lg:justify-end">
        {status === "open" && !started ? (
          <button
            type="button"
            onClick={startClosing}
            disabled={pending || !importId || mealPixBlocked}
            className="ui-btn-primary"
            title={
              mealPixBlocked
                ? mealPixBlockReason ?? undefined
                : !importId
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
            disabled={pending || mealPixBlocked || !compensation}
            className="ui-btn-primary"
            title={
              mealPixBlocked
                ? mealPixBlockReason ?? undefined
                : !canSubmit
                  ? "Você pode marcar deslocamento/refeição e salvar. O envio libera quando as justificativas estiverem ok."
                  : undefined
            }
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Continuar preenchimento
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
                    {formatDateTimeBrazil(closing.manager_rejected_at)}
                  </p>
                ) : null}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => openValuesModal("resubmit")}
              disabled={pending || mealPixBlocked || !compensation}
              className="ui-btn-primary w-full sm:w-auto"
              title={
                mealPixBlocked
                  ? mealPixBlockReason ?? undefined
                  : !canSubmit
                    ? "Você pode salvar o rascunho. O reenvio libera quando as justificativas estiverem ok."
                    : undefined
              }
            >
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Continuar correção
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
            {(closing?.meal_presencial_days ?? 0) > 0 ||
            (closing?.meal_amount ?? 0) > 0 ||
            compensation?.require_meal_pix_receipt
              ? "Aprovado · envie NF, boleto e comprovante de refeição."
              : "Aprovado · envie NF e boleto em PDF."}
          </p>
        ) : null}

        {status === "finalized" && closing ? (
          <p className="max-w-[18rem] text-xs text-muted-foreground text-pretty sm:text-right">
            {(closing.meal_presencial_days ?? 0) > 0 ||
            (closing.meal_amount ?? 0) > 0 ||
            compensation?.require_meal_pix_receipt
              ? "Finalizado · NF/boleto bloqueados; comprovante de refeição ainda pode ser enviado."
              : "Finalizado · documentos somente leitura."}
          </p>
        ) : null}

        {error ? (
          <p className="max-w-[18rem] text-xs text-danger text-pretty sm:text-right">
            {error}
          </p>
        ) : null}

        {info ? (
          <p className="max-w-[18rem] text-xs text-emerald-800 dark:text-emerald-200 text-pretty sm:text-right">
            {info}
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
          onSave={saveDraftValues}
          pending={pending}
          yearMonth={yearMonth}
          compensation={compensation}
          workedHours={workedHours}
          holidays={holidays}
          initialTravelDays={initialTravelDays}
          initialMealDays={initialMealDays}
          initialAbsenceDays={initialAbsenceDays}
          initialMakeupDays={initialMakeupDays}
          initialValuesNotes={initialValuesNotes}
          canConfirm={canConfirmSubmit}
          confirmBlockedReason={confirmBlockedReason}
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
          ? "Revise os cards entregues no mês (se houver). Sem cards, ainda é possível enviar o fechamento informando presença e valores."
          : "Base congelada no envio ao gestor (snapshot)."
      }
    >
      {auditRows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status === "open" || status === "rejected"
            ? "Nenhum card com Entrega TU neste mês. Você pode enviar o fechamento mesmo assim — preencha deslocamento, refeição e valores na próxima etapa."
            : "Nenhum card com Entrega TU foi incluído no snapshot deste fechamento."}
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
