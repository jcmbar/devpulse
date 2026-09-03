"use client";

import {
  createTimeBankAdjustmentAction,
  reverseTimeBankEntryAction,
} from "@/app/app/developers/actions";
import { EmptyState, Surface, DataTable } from "@/components/surface";
import { formatDateBrazil } from "@/lib/datetime/format-brazil";
import {
  formatTimeBankMinutes,
  formatUnsignedTimeBankMinutes,
} from "@/lib/metrics/time-bank";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import {
  TIME_BANK_ENTRY_SOURCE_LABELS,
  TIME_BANK_ENTRY_SOURCES,
  TIME_BANK_ENTRY_STATUS_LABELS,
  TIME_BANK_ENTRY_TYPE_LABELS,
  TIME_BANK_ENTRY_TYPES,
  type TimeBankEntry,
  type TimeBankSummary,
} from "@/types/time-bank";
import { CalendarClock, Plus, RotateCcw } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

const PAGE_SIZE = 12;

type TimeBankLedgerPanelProps = {
  developerId: string;
  developerName: string;
  summary: TimeBankSummary;
  entries: TimeBankEntry[];
  canManage: boolean;
  selfView?: boolean;
  helperText?: string | null;
};

type ActionResult = {
  ok: boolean;
  error: string | null;
  success: string | null;
};

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string | null;
}) {
  return (
    <Surface className="space-y-1.5 p-4" padded={false}>
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
    </Surface>
  );
}

function AdjustmentModal({
  open,
  developerId,
  developerName,
  onClose,
  onComplete,
}: {
  open: boolean;
  developerId: string;
  developerName: string;
  onClose: () => void;
  onComplete: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [entryType, setEntryType] = useState<"credit" | "debit">("credit");
  const [hours, setHours] = useState("");
  const [entryDate, setEntryDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [yearMonth, setYearMonth] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [description, setDescription] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);

  if (!open) {
    return null;
  }

  function submit() {
    startTransition(async () => {
      const next = await createTimeBankAdjustmentAction({
        developerId,
        entryType,
        hours,
        entryDate,
        yearMonth,
        description,
        internalNote,
      });
      setResult(next);
      if (next.ok) {
        onComplete(next.success);
        onClose();
      }
    });
  }

  const summaryText = hours.trim()
    ? `Sera lançado um ${entryType === "credit" ? "crédito" : "débito"} de ${hours} no banco de horas de ${developerName}.`
    : `Escolha o tipo e informe a quantidade de horas para ${developerName}.`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div className="w-full max-w-2xl rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow-lg)]">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight">Novo ajuste</h3>
          <p className="text-sm text-muted-foreground">
            Lance um crédito ou débito auditável sem editar o histórico.
          </p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Colaborador</span>
            <input className="ui-input" value={developerName} disabled />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Tipo de lançamento</span>
            <select
              className="ui-select"
              value={entryType}
              onChange={(event) =>
                setEntryType(event.target.value === "debit" ? "debit" : "credit")
              }
            >
              <option value="credit">Crédito de horas</option>
              <option value="debit">Débito de horas</option>
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Quantidade de horas</span>
            <input
              className="ui-input"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="2,5 ou 02:30"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Data do lançamento</span>
            <input
              type="date"
              className="ui-input"
              value={entryDate}
              onChange={(event) => setEntryDate(event.target.value)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Competência</span>
            <input
              type="month"
              className="ui-input"
              value={yearMonth}
              onChange={(event) => setYearMonth(event.target.value)}
            />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Motivo / descrição</span>
            <textarea
              className="ui-input min-h-24 py-2"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium">Observação interna</span>
            <textarea
              className="ui-input min-h-20 py-2"
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
              placeholder="Opcional"
            />
          </label>
        </div>

        <div className="mt-4 rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-2.5 text-sm">
          {summaryText}
        </div>

        {result?.error ? (
          <p className="mt-3 text-sm text-danger">{result.error}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="ui-btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui-btn-primary"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "Salvando..." : "Confirmar ajuste"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReversalModal({
  open,
  developerId,
  entry,
  onClose,
  onComplete,
}: {
  open: boolean;
  developerId: string;
  entry: TimeBankEntry | null;
  onClose: () => void;
  onComplete: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open || !entry) {
    return null;
  }

  function submit() {
    const targetEntry = entry;
    if (!targetEntry) {
      return;
    }
    startTransition(async () => {
      const result = await reverseTimeBankEntryAction({
        developerId,
        entryId: targetEntry.id,
        description,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onComplete(result.success);
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-4 sm:items-center">
      <div className="w-full max-w-xl rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow-lg)]">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight">
            Reverter lançamento
          </h3>
          <p className="text-sm text-muted-foreground">
            A reversão cria um novo lançamento compensatório e preserva o
            histórico original.
          </p>
        </div>

        <div className="mt-4 rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-2.5 text-sm">
          Sera revertido um {TIME_BANK_ENTRY_TYPE_LABELS[entry.entry_type].toLowerCase()} de{" "}
          {formatUnsignedTimeBankMinutes(entry.minutes_amount)} referente a{" "}
          {formatYearMonthLabel(entry.year_month)}.
        </div>

        <label className="mt-4 block space-y-1.5">
          <span className="text-sm font-medium">Justificativa da reversão</span>
          <textarea
            className="ui-input min-h-24 py-2"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className="ui-btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="ui-btn-primary"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "Revertendo..." : "Confirmar reversão"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TimeBankLedgerPanel({
  developerId,
  developerName,
  summary,
  entries,
  canManage,
  selfView = false,
  helperText = null,
}: TimeBankLedgerPanelProps) {
  const [yearMonth, setYearMonth] = useState("all");
  const [entryType, setEntryType] = useState<"all" | "credit" | "debit">("all");
  const [source, setSource] = useState<
    "all" | "monthly_closing" | "manual_adjustment" | "reversal"
  >("all");
  const [page, setPage] = useState(1);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentSession, setAdjustmentSession] = useState(0);
  const [reversalEntryId, setReversalEntryId] = useState<string | null>(null);
  const [reversalSession, setReversalSession] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);

  const yearMonthOptions = useMemo(
    () => [...new Set(entries.map((entry) => entry.year_month))],
    [entries],
  );

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (yearMonth !== "all" && entry.year_month !== yearMonth) {
          return false;
        }
        if (entryType !== "all" && entry.entry_type !== entryType) {
          return false;
        }
        if (source !== "all" && entry.source !== source) {
          return false;
        }
        return true;
      }),
    [entries, entryType, source, yearMonth],
  );

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageEntries = filteredEntries.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const reversalEntry =
    entries.find((entry) => entry.id === reversalEntryId) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Saldo atual"
          value={formatTimeBankMinutes(summary.current_balance_minutes)}
          detail="Calculado pela soma de créditos menos débitos."
        />
        <MetricCard
          label="Crédito acumulado"
          value={formatUnsignedTimeBankMinutes(summary.credit_minutes)}
        />
        <MetricCard
          label="Débito acumulado"
          value={formatUnsignedTimeBankMinutes(summary.debit_minutes)}
        />
        <MetricCard
          label="Saldo após último lançamento"
          value={formatTimeBankMinutes(summary.latest_balance_minutes)}
          detail={
            summary.latest_reference_period
              ? `Última competência: ${formatYearMonthLabel(summary.latest_reference_period)}`
              : "Sem lançamentos ainda."
          }
        />
      </div>

      <Surface className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold tracking-tight">
              Histórico do banco de horas
            </h3>
            <p className="text-sm text-muted-foreground">
              {helperText ??
                "O saldo é atualizado a partir do histórico auditável do colaborador."}
            </p>
          </div>
          {canManage ? (
            <button
              type="button"
              className="ui-btn-primary"
              onClick={() => {
                setAdjustmentSession((value) => value + 1);
                setAdjustmentOpen(true);
              }}
            >
              <Plus className="size-4" />
              Novo ajuste
            </button>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Competência</span>
            <select
              className="ui-select"
              value={yearMonth}
              onChange={(event) => {
                setYearMonth(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todas</option>
              {yearMonthOptions.map((option) => (
                <option key={option} value={option}>
                  {formatYearMonthLabel(option)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Tipo</span>
            <select
              className="ui-select"
              value={entryType}
              onChange={(event) =>
                {
                  setEntryType(
                    event.target.value === "credit" ||
                      event.target.value === "debit"
                      ? event.target.value
                      : "all",
                  );
                  setPage(1);
                }
              }
            >
              <option value="all">Todos</option>
              {TIME_BANK_ENTRY_TYPES.map((option) => (
                <option key={option} value={option}>
                  {TIME_BANK_ENTRY_TYPE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Origem</span>
            <select
              className="ui-select"
              value={source}
              onChange={(event) =>
                {
                  setSource(
                    event.target.value === "monthly_closing" ||
                      event.target.value === "manual_adjustment" ||
                      event.target.value === "reversal"
                      ? event.target.value
                      : "all",
                  );
                  setPage(1);
                }
              }
            >
              <option value="all">Todas</option>
              {TIME_BANK_ENTRY_SOURCES.map((option) => (
                <option key={option} value={option}>
                  {TIME_BANK_ENTRY_SOURCE_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {feedback ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            {feedback}
          </p>
        ) : null}

        {filteredEntries.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nenhum lançamento de banco de horas foi registrado até o momento."
          />
        ) : (
          <>
            <DataTable minWidthClassName={selfView ? "min-w-[960px]" : "min-w-[1180px]"}>
              <thead>
                <tr>
                  <th>Data do lançamento</th>
                  <th>Competência</th>
                  {selfView ? (
                    <>
                      <th>Crédito</th>
                      <th>Débito</th>
                    </>
                  ) : (
                    <>
                      <th>Tipo</th>
                      <th>Horas</th>
                    </>
                  )}
                  <th>Saldo após lançamento</th>
                  <th>Origem</th>
                  <th>Descrição</th>
                  {!selfView ? <th>Registrado por</th> : null}
                  {!selfView ? <th>Status</th> : null}
                  {!selfView && canManage ? <th>Ações</th> : null}
                </tr>
              </thead>
              <tbody>
                {pageEntries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{formatDateBrazil(entry.entry_date)}</td>
                    <td>{formatYearMonthLabel(entry.year_month)}</td>
                    {selfView ? (
                      <>
                        <td>
                          {entry.entry_type === "credit"
                            ? formatUnsignedTimeBankMinutes(entry.minutes_amount)
                            : "—"}
                        </td>
                        <td>
                          {entry.entry_type === "debit"
                            ? formatUnsignedTimeBankMinutes(entry.minutes_amount)
                            : "—"}
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{TIME_BANK_ENTRY_TYPE_LABELS[entry.entry_type]}</td>
                        <td>{formatUnsignedTimeBankMinutes(entry.minutes_amount)}</td>
                      </>
                    )}
                    <td className="tabular-nums">
                      {formatTimeBankMinutes(entry.balance_after_minutes)}
                    </td>
                    <td>{TIME_BANK_ENTRY_SOURCE_LABELS[entry.source]}</td>
                    <td className="max-w-[26rem] whitespace-normal">
                      {entry.description}
                    </td>
                    {!selfView ? <td>{entry.created_by_name ?? "Sistema"}</td> : null}
                    {!selfView ? (
                      <td>{TIME_BANK_ENTRY_STATUS_LABELS[entry.status]}</td>
                    ) : null}
                    {!selfView && canManage ? (
                      <td>
                        {entry.can_reverse ? (
                          <button
                            type="button"
                            className="ui-btn-secondary ui-control-sm"
                            onClick={() => {
                              setReversalSession((value) => value + 1);
                              setReversalEntryId(entry.id);
                            }}
                          >
                            <RotateCcw className="size-3.5" />
                            Reverter
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </DataTable>

            <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>
                {filteredEntries.length} lançamento(s) encontrado(s) · página{" "}
                {currentPage} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="ui-btn-secondary ui-control-sm"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage <= 1}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="ui-btn-secondary ui-control-sm"
                  onClick={() =>
                    setPage((value) => Math.min(totalPages, value + 1))
                  }
                  disabled={currentPage >= totalPages}
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </Surface>

      <AdjustmentModal
        key={adjustmentSession}
        open={adjustmentOpen}
        developerId={developerId}
        developerName={developerName}
        onClose={() => setAdjustmentOpen(false)}
        onComplete={setFeedback}
      />

      <ReversalModal
        key={reversalSession}
        open={Boolean(reversalEntryId)}
        developerId={developerId}
        entry={reversalEntry}
        onClose={() => setReversalEntryId(null)}
        onComplete={setFeedback}
      />
    </div>
  );
}
