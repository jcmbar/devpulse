"use client";

import { GestorClosingDecisionPanel } from "@/components/monthly-closing/gestor-closing-decision";
import { formatClosingMoney } from "@/lib/metrics/closing-submit-values";
import {
  CLOSING_FOLHA_COMPARE_FIELD_LABELS,
  formatCompareDailyRates,
  formatCompareDays,
  formatCompareMoneyWithDays,
  type ClosingFolhaCompareField,
  type ClosingFolhaCompareResult,
  type ClosingValuesSide,
} from "@/lib/metrics/closing-folha-compare";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { cn } from "@/lib/utils";
import { COMPENSATION_BASE_TYPE_LABELS } from "@/types/developer-compensation";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type {
  MonthlyClosing,
  MonthlyClosingAttachment,
  MonthlyClosingPresenceDay,
} from "@/types/monthly-closing";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";

type GestorClosingReviewTabsProps = {
  closing: MonthlyClosing;
  attachments: MonthlyClosingAttachment[];
  presenceDays: MonthlyClosingPresenceDay[];
  issuers: InvoiceIssuer[];
  defaultIssuerId?: string | null;
  selectedIssuer?: InvoiceIssuer | null;
  folhaCompare: ClosingFolhaCompareResult;
  userSide: ClosingValuesSide | null;
  folhaSide: ClosingValuesSide | null;
  requireMealPixReceipt?: boolean;
  financeiroDispatchStatus?: import("@/types/operational-email").EmailDispatchStatus | null;
  financeiroDispatchError?: string | null;
};

function formatHours(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return "—";
  }
  return `${value.toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} h`;
}

function DayChips({
  days,
  emptyLabel,
  mismatch = false,
}: {
  days: string[];
  emptyLabel: string;
  mismatch?: boolean;
}) {
  if (days.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((day) => (
        <span
          key={day}
          className={cn(
            "inline-flex rounded-[var(--radius-sm)] border px-2 py-0.5 text-xs tabular-nums",
            mismatch
              ? "border-amber-500/45 bg-amber-500/15"
              : "border-border bg-muted/30",
          )}
        >
          {day.slice(8, 10)}/{day.slice(5, 7)}
        </span>
      ))}
    </div>
  );
}

function fieldMismatched(
  compare: ClosingFolhaCompareResult,
  field: ClosingFolhaCompareField,
): boolean {
  return compare.mismatches.includes(field);
}

export function GestorClosingReviewTabs({
  closing,
  attachments,
  presenceDays,
  issuers,
  defaultIssuerId = null,
  selectedIssuer = null,
  folhaCompare,
  userSide,
  folhaSide,
  requireMealPixReceipt = false,
  financeiroDispatchStatus = null,
  financeiroDispatchError = null,
}: GestorClosingReviewTabsProps) {
  const [tab, setTab] = useState<"decisao" | "valores">("decisao");

  const travelDays = useMemo(
    () =>
      presenceDays
        .filter((row) => row.kind === "travel")
        .map((row) => row.day_on),
    [presenceDays],
  );
  const mealDays = useMemo(
    () =>
      presenceDays.filter((row) => row.kind === "meal").map((row) => row.day_on),
    [presenceDays],
  );

  const hasValues = closing.values_submitted_at != null;
  const blocksDecision = folhaCompare.blocksDecision;

  return (
    <div className="space-y-3">
      {blocksDecision ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-amber-500/50 bg-amber-500/15 px-3 py-2.5 text-sm text-amber-950 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <div className="space-y-1">
            <p className="font-semibold tracking-tight">
              Divergência Folha × envio do usuário
            </p>
            <p className="text-pretty text-xs opacity-90">
              {!folhaCompare.hasFolha
                ? "Não há linha na Folha para esta pessoa/mês. Ajuste a Folha antes de aprovar ou finalizar."
                : `Campos divergentes: ${folhaCompare.mismatches
                    .map((field) => CLOSING_FOLHA_COMPARE_FIELD_LABELS[field])
                    .join(", ")}. Corrija antes de aprovar ou finalizar.`}
            </p>
          </div>
        </div>
      ) : hasValues && folhaCompare.hasFolha ? (
        <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-emerald-500/40 bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-950 dark:text-emerald-100">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
          <p className="text-pretty text-xs">
            Valores do envio conferem com a Folha nos campos comparados.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setTab("decisao")}
          className={cn(
            "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-medium",
            tab === "decisao"
              ? "border-brand/40 bg-brand-soft text-foreground"
              : "border-border hover:bg-muted",
          )}
        >
          Decisão
        </button>
        <button
          type="button"
          onClick={() => setTab("valores")}
          className={cn(
            "rounded-[var(--radius-sm)] border px-3 py-1.5 text-sm font-medium",
            tab === "valores"
              ? "border-brand/40 bg-brand-soft text-foreground"
              : "border-border hover:bg-muted",
            blocksDecision && "border-amber-500/50",
          )}
        >
          Valores
          {blocksDecision ? (
            <span className="ml-1.5 text-[10px] font-semibold uppercase text-amber-800 dark:text-amber-200">
              Divergência
            </span>
          ) : null}
        </button>
      </div>

      {tab === "decisao" ? (
        <GestorClosingDecisionPanel
          closing={closing}
          attachments={attachments}
          issuers={issuers}
          defaultIssuerId={defaultIssuerId}
          selectedIssuer={selectedIssuer}
          valuesMismatch={blocksDecision}
          valuesMismatchSummary={
            !folhaCompare.hasFolha
              ? "Sem linha na Folha para esta pessoa/mês."
              : `Divergências: ${folhaCompare.mismatches
                  .map((field) => CLOSING_FOLHA_COMPARE_FIELD_LABELS[field])
                  .join(", ")}.`
          }
          requireMealPixReceipt={requireMealPixReceipt}
          financeiroDispatchStatus={financeiroDispatchStatus}
          financeiroDispatchError={financeiroDispatchError}
          hasInvoicePdf={Boolean(
            attachments.find((row) => row.type === "invoice_pdf"),
          )}
          hasBoletoPdf={Boolean(
            attachments.find((row) => row.type === "boleto_pdf"),
          )}
        />
      ) : (
        <section className="space-y-4 rounded-[var(--radius)] border border-border p-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight">
              Conferência Folha × envio do usuário
            </h3>
            <p className="text-xs text-muted-foreground">
              Usuário = valores do fechamento enviado. Folha = linha gestora em{" "}
              {formatYearMonthLabel(closing.year_month)}.
            </p>
          </div>

          {!hasValues ? (
            <p className="text-sm text-muted-foreground">
              Este fechamento ainda não possui valores de presença/NF gravados
              (envio anterior à nova regra ou dados incompletos).
            </p>
          ) : (
            <>
              <CompareTable
                compare={folhaCompare}
                userSide={userSide}
                folhaSide={folhaSide}
              />

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Metric
                  label="Deslocamento (usuário)"
                  value={`${closing.travel_presencial_days ?? 0} dia(s)`}
                  detail={formatClosingMoney(closing.travel_amount)}
                  mismatch={fieldMismatched(folhaCompare, "travelAmount")}
                />
                <Metric
                  label="Refeição (usuário)"
                  value={`${closing.meal_presencial_days ?? 0} dia(s)`}
                  detail={formatClosingMoney(closing.meal_amount)}
                  mismatch={fieldMismatched(folhaCompare, "mealAmount")}
                />
                <Metric
                  label="Diferencial (usuário)"
                  value={formatClosingMoney(closing.differential_amount)}
                  detail={
                    closing.compensation_base_type
                      ? COMPENSATION_BASE_TYPE_LABELS[
                          closing.compensation_base_type
                        ]
                      : undefined
                  }
                  mismatch={fieldMismatched(folhaCompare, "differentialAmount")}
                />
                <Metric
                  label="Total NF (usuário)"
                  value={formatClosingMoney(closing.invoice_amount)}
                  detail={`Base ${formatClosingMoney(closing.compensation_base_amount)}`}
                  mismatch={fieldMismatched(folhaCompare, "invoiceAmount")}
                />
              </div>

              <div
                className={cn(
                  "grid gap-2 rounded-[var(--radius-sm)] border p-3 text-sm sm:grid-cols-3",
                  fieldMismatched(folhaCompare, "dailyRates")
                    ? "border-amber-500/45 bg-amber-500/10"
                    : "border-border bg-muted/15",
                )}
              >
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Horas realizadas (snapshot)
                  </p>
                  <p className="font-medium tabular-nums">
                    {formatHours(closing.worked_hours_snapshot)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Valor/hora
                  </p>
                  <p className="font-medium tabular-nums">
                    {formatClosingMoney(closing.compensation_hourly_rate)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Diárias (usuário)
                  </p>
                  <p className="font-medium tabular-nums">
                    Desloc.{" "}
                    {formatClosingMoney(
                      closing.compensation_daily_travel_amount,
                    )}{" "}
                    · Ref.{" "}
                    {formatClosingMoney(closing.compensation_daily_meal_amount)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Dias — Deslocamento (usuário)
                  </p>
                  <DayChips
                    days={travelDays}
                    emptyLabel="Nenhum dia de deslocamento selecionado."
                    mismatch={fieldMismatched(folhaCompare, "travelDays")}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Dias — Refeição (usuário)
                  </p>
                  <DayChips
                    days={mealDays}
                    emptyLabel="Nenhum dia de refeição selecionado."
                    mismatch={fieldMismatched(folhaCompare, "mealDays")}
                  />
                </div>
              </div>

              {closing.developer_values_notes ? (
                <div className="space-y-1.5 rounded-[var(--radius-sm)] border border-border px-3 py-3">
                  <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Observação do developer
                  </p>
                  <p className="text-sm text-pretty whitespace-pre-wrap">
                    {closing.developer_values_notes}
                  </p>
                </div>
              ) : null}
            </>
          )}
        </section>
      )}
    </div>
  );
}

function CompareTable({
  compare,
  userSide,
  folhaSide,
}: {
  compare: ClosingFolhaCompareResult;
  userSide: ClosingValuesSide | null;
  folhaSide: ClosingValuesSide | null;
}) {
  const rows: Array<{
    field: ClosingFolhaCompareField;
    user: string;
    folha: string;
  }> = [
    {
      field: "travelAmount",
      user: userSide
        ? formatCompareMoneyWithDays({
            amount: userSide.travelAmount,
            dayCount: userSide.travelDays.length,
          })
        : "—",
      folha: folhaSide
        ? formatCompareMoneyWithDays({
            amount: folhaSide.travelAmount,
            dayCount: folhaSide.travelDays.length,
          })
        : "Sem Folha",
    },
    {
      field: "mealAmount",
      user: userSide
        ? formatCompareMoneyWithDays({
            amount: userSide.mealAmount,
            dayCount: userSide.mealDays.length,
          })
        : "—",
      folha: folhaSide
        ? formatCompareMoneyWithDays({
            amount: folhaSide.mealAmount,
            dayCount: folhaSide.mealDays.length,
          })
        : "Sem Folha",
    },
    {
      field: "differentialAmount",
      user: formatClosingMoney(userSide?.differentialAmount),
      folha: folhaSide
        ? formatClosingMoney(folhaSide.differentialAmount)
        : "Sem Folha",
    },
    {
      field: "invoiceAmount",
      user: formatClosingMoney(userSide?.invoiceAmount),
      folha: folhaSide
        ? formatClosingMoney(folhaSide.invoiceAmount)
        : "Sem Folha",
    },
    {
      field: "dailyRates",
      user: userSide ? formatCompareDailyRates(userSide) : "—",
      folha: folhaSide ? formatCompareDailyRates(folhaSide) : "Sem Folha",
    },
    {
      field: "travelDays",
      user: userSide ? formatCompareDays(userSide.travelDays) : "—",
      folha: folhaSide ? formatCompareDays(folhaSide.travelDays) : "Sem Folha",
    },
    {
      field: "mealDays",
      user: userSide ? formatCompareDays(userSide.mealDays) : "—",
      folha: folhaSide ? formatCompareDays(folhaSide.mealDays) : "Sem Folha",
    },
  ];

  return (
    <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-border">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead className="bg-muted/30 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2">Campo</th>
            <th className="px-3 py-2">Usuário (envio)</th>
            <th className="px-3 py-2">Folha (gestor)</th>
            <th className="px-3 py-2 text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const mismatch = fieldMismatched(compare, row.field);
            return (
              <tr
                key={row.field}
                className={cn(
                  "border-t border-border/70",
                  mismatch && "bg-amber-500/10",
                )}
              >
                <td className="px-3 py-2 font-medium">
                  {CLOSING_FOLHA_COMPARE_FIELD_LABELS[row.field]}
                </td>
                <td className="px-3 py-2 tabular-nums text-pretty">{row.user}</td>
                <td className="px-3 py-2 tabular-nums text-pretty">{row.folha}</td>
                <td className="px-3 py-2 text-center">
                  {mismatch ? (
                    <span className="inline-flex items-center gap-1 rounded-[calc(var(--radius-sm)-2px)] border border-amber-500/45 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                      <AlertTriangle className="size-3" aria-hidden />
                      Divergente
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-[calc(var(--radius-sm)-2px)] border border-emerald-500/35 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                      <CheckCircle2 className="size-3" aria-hidden />
                      Ok
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  mismatch = false,
}: {
  label: string;
  value: string;
  detail?: string;
  mismatch?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-sm)] border px-3 py-2.5",
        mismatch
          ? "border-amber-500/45 bg-amber-500/10"
          : "border-border bg-muted/10",
      )}
    >
      <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums tracking-tight">
        {value}
      </p>
      {detail ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
      ) : null}
    </div>
  );
}
