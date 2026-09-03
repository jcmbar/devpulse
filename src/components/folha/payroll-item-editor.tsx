"use client";

import {
  restorePayrollItemCalculatedAction,
  setPayrollItemReviewedAction,
  updatePayrollItemAction,
  type PayrollFormState,
} from "@/app/app/gestor/folha/actions";
import { PersonAvatar } from "@/components/person-avatar";
import { FormFeedback } from "@/components/ui/form";
import { formatDateTimeBrazil } from "@/lib/datetime/format-brazil";
import { cn } from "@/lib/utils";
import {
  COMPENSATION_BASE_TYPE_LABELS,
} from "@/types/developer-compensation";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type {
  PayrollAutoAmountField,
  PayrollClosingItemWithIssuer,
} from "@/types/payroll-closing";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

const initialState: PayrollFormState = {
  error: null,
  success: null,
};

const MASKED_MONEY = "R$ ••••";

function moneyInputValue(value: number): string {
  return String(value);
}

type PayrollItemEditorProps = {
  item: PayrollClosingItemWithIssuer;
  issuers: InvoiceIssuer[];
  onOpenAttendance: () => void;
  jiraHours: number;
  contractedHoursDelta: number;
  readOnly?: boolean;
  /** When set, monthly closing is finalized — line is locked. */
  finalizedClosingId?: string | null;
  /** When false, monetary amounts are masked. */
  moneyVisible?: boolean;
  onToggleMoneyVisible?: () => void;
  avatarUrl?: string | null;
};

function formatHours(value: number): string {
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} h`;
}

function RestoreCalculatedButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="text-[11px] font-medium text-brand underline-offset-2 hover:underline disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function PayrollItemEditor({
  item,
  issuers,
  onOpenAttendance,
  jiraHours,
  contractedHoursDelta,
  readOnly = false,
  finalizedClosingId = null,
  moneyVisible = false,
  onToggleMoneyVisible,
  avatarUrl = null,
}: PayrollItemEditorProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(
    updatePayrollItemAction,
    initialState,
  );
  const [restorePending, startRestore] = useTransition();
  const [reviewPending, startReview] = useTransition();
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const lockedByFinalized = finalizedClosingId != null;
  const inputsDisabled = readOnly || lockedByFinalized;
  const busy = isPending || restorePending || reviewPending;
  const hasManualAutoField =
    item.differential_manual || item.travel_manual || item.meal_manual;
  const [issuerId, setIssuerId] = useState(item.invoice_issuer_id ?? "");
  const [issuerSyncedFrom, setIssuerSyncedFrom] = useState(
    item.invoice_issuer_id ?? "",
  );

  // Keep select in sync after server refresh (defaultValue alone would stick).
  const issuerFromServer = item.invoice_issuer_id ?? "";
  if (issuerFromServer !== issuerSyncedFrom) {
    setIssuerSyncedFrom(issuerFromServer);
    setIssuerId(issuerFromServer);
  }

  function restore(fields: PayrollAutoAmountField) {
    setRestoreError(null);
    startRestore(async () => {
      const result = await restorePayrollItemCalculatedAction({
        itemId: item.id,
        fields,
      });
      if (!result.ok) {
        setRestoreError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleReviewed() {
    setReviewError(null);
    startReview(async () => {
      const result = await setPayrollItemReviewedAction({
        itemId: item.id,
        reviewed: !item.is_reviewed,
      });
      if (!result.ok) {
        setReviewError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <tr className={cn(item.is_reviewed && "bg-emerald-500/[0.04]")}>
      <td className="align-top">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <PersonAvatar
              name={item.developer_name}
              src={avatarUrl}
              size="sm"
            />
            <p className="font-medium text-foreground">{item.developer_name}</p>
            {onToggleMoneyVisible ? (
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onToggleMoneyVisible();
                }}
                className="inline-flex size-7 items-center justify-center rounded-[var(--radius-sm)] border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
                aria-label={
                  moneyVisible
                    ? `Ocultar valores de ${item.developer_name}`
                    : `Exibir valores de ${item.developer_name}`
                }
                title={
                  moneyVisible
                    ? "Ocultar valores desta pessoa"
                    : "Exibir valores desta pessoa"
                }
              >
                {moneyVisible ? (
                  <EyeOff className="size-3.5" aria-hidden />
                ) : (
                  <Eye className="size-3.5" aria-hidden />
                )}
              </button>
            ) : null}
            {item.is_reviewed ? (
              <span className="inline-flex items-center gap-1 rounded-[calc(var(--radius-sm)-2px)] border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="size-3" aria-hidden />
                Conferido
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {COMPENSATION_BASE_TYPE_LABELS[item.base_type]}
            {item.base_type === "variable" && item.hourly_rate != null
              ? moneyVisible
                ? ` · R$ ${item.hourly_rate.toLocaleString("pt-BR")}/h`
                : " · R$ ••••/h"
              : null}
          </p>
          <button
            type="button"
            onClick={onOpenAttendance}
            className="text-left text-xs font-medium text-brand underline-offset-4 hover:underline"
          >
            Presença ({item.presencial_days_count} dias)
          </button>
        </div>
      </td>
      <td className="align-top tabular-nums">
        {moneyVisible
          ? item.base_amount.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })
          : MASKED_MONEY}
      </td>
      <td className="align-top">
        <p className="tabular-nums font-medium">{formatHours(jiraHours)}</p>
        <p className="text-[11px] text-muted-foreground">
          Contratado: {formatHours(item.contracted_hours_per_month)}
        </p>
      </td>
      <td className="align-top">
        <p
          className={cn(
            "tabular-nums font-semibold",
            contractedHoursDelta < 0 &&
              "text-red-600 dark:text-red-400",
            contractedHoursDelta > 0 &&
              "text-sky-600 dark:text-sky-400",
            contractedHoursDelta === 0 && "text-muted-foreground",
          )}
        >
          {contractedHoursDelta > 0 ? "+" : ""}
          {formatHours(contractedHoursDelta)}
        </p>
      </td>
      <td className="align-top" colSpan={5}>
        <form
          action={formAction}
          className="space-y-2"
          key={`${item.id}-${item.updated_at}`}
        >
          <input type="hidden" name="itemId" value={item.id} />
          {/* Always submitted — native <select disabled> is omitted from FormData. */}
          <input type="hidden" name="invoiceIssuerId" value={issuerId} />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <div className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">
                  Diferencial
                  {item.differential_manual ? " · manual" : ""}
                </span>
                {moneyVisible && !inputsDisabled && item.differential_manual ? (
                  <RestoreCalculatedButton
                    label="Restaurar"
                    disabled={busy}
                    onClick={() => restore("differential")}
                  />
                ) : null}
              </div>
              {moneyVisible ? (
                <input
                  name="differentialAmount"
                  type="text"
                  inputMode="decimal"
                  defaultValue={moneyInputValue(item.differential_amount)}
                  disabled={inputsDisabled}
                  className="ui-input"
                />
              ) : (
                <p className="ui-input text-muted-foreground tabular-nums">
                  {MASKED_MONEY}
                </p>
              )}
            </div>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Descontos</span>
              {moneyVisible ? (
                <input
                  name="discountsAmount"
                  type="text"
                  inputMode="decimal"
                  defaultValue={moneyInputValue(item.discounts_amount)}
                  disabled={inputsDisabled}
                  className="ui-input"
                />
              ) : (
                <p className="ui-input text-muted-foreground tabular-nums">
                  {MASKED_MONEY}
                </p>
              )}
            </label>
            <div className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">
                  Deslocamento
                  {item.travel_manual ? " · manual" : ""}
                </span>
                {moneyVisible && !inputsDisabled && item.travel_manual ? (
                  <RestoreCalculatedButton
                    label="Restaurar"
                    disabled={busy}
                    onClick={() => restore("travel")}
                  />
                ) : null}
              </div>
              {moneyVisible ? (
                <input
                  name="travelAmount"
                  type="text"
                  inputMode="decimal"
                  defaultValue={moneyInputValue(item.travel_amount)}
                  disabled={inputsDisabled}
                  className="ui-input"
                />
              ) : (
                <p className="ui-input text-muted-foreground tabular-nums">
                  {MASKED_MONEY}
                </p>
              )}
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">
                  Refeição
                  {item.meal_manual ? " · manual" : ""}
                </span>
                {moneyVisible && !inputsDisabled && item.meal_manual ? (
                  <RestoreCalculatedButton
                    label="Restaurar"
                    disabled={busy}
                    onClick={() => restore("meal")}
                  />
                ) : null}
              </div>
              {moneyVisible ? (
                <input
                  name="mealAmount"
                  type="text"
                  inputMode="decimal"
                  defaultValue={moneyInputValue(item.meal_amount)}
                  disabled={inputsDisabled}
                  className="ui-input"
                />
              ) : (
                <p className="ui-input text-muted-foreground tabular-nums">
                  {MASKED_MONEY}
                </p>
              )}
            </div>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Empresa NF</span>
              <select
                value={issuerId}
                onChange={(event) => setIssuerId(event.target.value)}
                disabled={inputsDisabled}
                className="ui-select"
              >
                <option value="">—</option>
                {issuers.map((issuer) => (
                  <option key={issuer.id} value={issuer.id}>
                    {issuer.legal_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="ui-control-row">
            <p className="text-sm font-medium tabular-nums">
              NF:{" "}
              {moneyVisible
                ? item.invoice_amount.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })
                : MASKED_MONEY}
            </p>
            {lockedByFinalized ? (
              <p className="text-xs text-amber-800 dark:text-amber-200">
                Fechamento finalizado — reabra o fechamento para editar.{" "}
                <Link
                  href={`/app/gestor/fechamentos/${finalizedClosingId}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  Abrir fechamento
                </Link>
              </p>
            ) : !readOnly ? (
              <>
                <button
                  type="submit"
                  className="ui-btn-secondary"
                  disabled={busy || !moneyVisible}
                  title={
                    moneyVisible
                      ? undefined
                      : "Exiba os valores (olho) antes de salvar a linha"
                  }
                >
                  {isPending ? "Salvando..." : "Salvar linha"}
                </button>
                <button
                  type="button"
                  className="ui-btn-ghost"
                  disabled={busy}
                  title={
                    hasManualAutoField
                      ? "Remove os ajustes manuais desta linha e volta diferencial, deslocamento e refeição ao cálculo automático (cadastro + presença)."
                      : "Atualiza o snapshot do cadastro nesta linha e recalcula os campos automáticos."
                  }
                  onClick={() => restore("all")}
                >
                  {restorePending
                    ? "Restaurando..."
                    : hasManualAutoField
                      ? "Restaurar calculados"
                      : "Recalcular linha"}
                </button>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1.5",
                    item.is_reviewed ? "ui-btn-secondary" : "ui-btn-primary",
                  )}
                  disabled={busy}
                  title={
                    item.is_reviewed
                      ? "Remove a marcação de conferido"
                      : "Marca que você já conferiu os ajustes desta pessoa no mês"
                  }
                  onClick={toggleReviewed}
                >
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  {reviewPending
                    ? "Atualizando..."
                    : item.is_reviewed
                      ? "Desfazer conferido"
                      : "Marcar como conferido"}
                </button>
              </>
            ) : item.is_reviewed ? (
              <span className="text-xs text-emerald-700 dark:text-emerald-300">
                Conferido
                {item.reviewed_at
                  ? ` · ${formatDateTimeBrazil(item.reviewed_at)}`
                  : ""}
              </span>
            ) : null}
            <FormFeedback error={state.error} success={state.success} />
            {restoreError ? (
              <p className="text-xs text-destructive" role="alert">
                {restoreError}
              </p>
            ) : null}
            {reviewError ? (
              <p className="text-xs text-destructive" role="alert">
                {reviewError}
              </p>
            ) : null}
          </div>
        </form>
      </td>
    </tr>
  );
}
