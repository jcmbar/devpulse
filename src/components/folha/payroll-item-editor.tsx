"use client";

import {
  restorePayrollItemCalculatedAction,
  setPayrollItemReviewedAction,
  updatePayrollItemAction,
  type PayrollFormState,
} from "@/app/app/gestor/folha/actions";
import { FormFeedback } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import {
  COMPENSATION_BASE_TYPE_LABELS,
} from "@/types/developer-compensation";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type {
  PayrollAutoAmountField,
  PayrollClosingItemWithIssuer,
} from "@/types/payroll-closing";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState, useTransition } from "react";

const initialState: PayrollFormState = {
  error: null,
  success: null,
};

function moneyInputValue(value: number): string {
  return String(value);
}

type PayrollItemEditorProps = {
  item: PayrollClosingItemWithIssuer;
  issuers: InvoiceIssuer[];
  attendanceHref: string;
  readOnly?: boolean;
};

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
  attendanceHref,
  readOnly = false,
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

  const busy = isPending || restorePending || reviewPending;
  const hasManualAutoField =
    item.differential_manual || item.travel_manual || item.meal_manual;

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
            <p className="font-medium text-foreground">{item.developer_name}</p>
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
              ? ` · R$ ${item.hourly_rate.toLocaleString("pt-BR")}/h`
              : null}
          </p>
          <Link
            href={attendanceHref}
            className="text-xs font-medium text-brand underline-offset-4 hover:underline"
          >
            Presença ({item.presencial_days_count} dias)
          </Link>
        </div>
      </td>
      <td className="align-top tabular-nums">
        {item.base_amount.toLocaleString("pt-BR", {
          style: "currency",
          currency: "BRL",
        })}
      </td>
      <td className="align-top" colSpan={5}>
        <form action={formAction} className="space-y-2">
          <input type="hidden" name="itemId" value={item.id} />
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <div className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">
                  Diferencial
                  {item.differential_manual ? " · manual" : ""}
                </span>
                {!readOnly && item.differential_manual ? (
                  <RestoreCalculatedButton
                    label="Restaurar"
                    disabled={busy}
                    onClick={() => restore("differential")}
                  />
                ) : null}
              </div>
              <input
                name="differentialAmount"
                type="text"
                inputMode="decimal"
                defaultValue={moneyInputValue(item.differential_amount)}
                disabled={readOnly || busy}
                className="ui-input text-sm"
              />
            </div>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Descontos</span>
              <input
                name="discountsAmount"
                type="text"
                inputMode="decimal"
                defaultValue={moneyInputValue(item.discounts_amount)}
                disabled={readOnly || busy}
                className="ui-input text-sm"
              />
            </label>
            <div className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">
                  Deslocamento
                  {item.travel_manual ? " · manual" : ""}
                </span>
                {!readOnly && item.travel_manual ? (
                  <RestoreCalculatedButton
                    label="Restaurar"
                    disabled={busy}
                    onClick={() => restore("travel")}
                  />
                ) : null}
              </div>
              <input
                name="travelAmount"
                type="text"
                inputMode="decimal"
                defaultValue={moneyInputValue(item.travel_amount)}
                disabled={readOnly || busy}
                className="ui-input text-sm"
              />
            </div>
            <div className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-muted-foreground">
                  Refeição
                  {item.meal_manual ? " · manual" : ""}
                </span>
                {!readOnly && item.meal_manual ? (
                  <RestoreCalculatedButton
                    label="Restaurar"
                    disabled={busy}
                    onClick={() => restore("meal")}
                  />
                ) : null}
              </div>
              <input
                name="mealAmount"
                type="text"
                inputMode="decimal"
                defaultValue={moneyInputValue(item.meal_amount)}
                disabled={readOnly || busy}
                className="ui-input text-sm"
              />
            </div>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Empresa NF</span>
              <select
                name="invoiceIssuerId"
                defaultValue={item.invoice_issuer_id ?? ""}
                disabled={readOnly || busy}
                className="ui-select text-sm"
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
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-medium tabular-nums">
              NF:{" "}
              {item.invoice_amount.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </p>
            {!readOnly ? (
              <>
                <button
                  type="submit"
                  className="ui-btn-secondary text-xs"
                  disabled={busy}
                >
                  {isPending ? "Salvando..." : "Salvar linha"}
                </button>
                <button
                  type="button"
                  className="ui-btn-ghost text-xs"
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
                    "inline-flex items-center gap-1.5 text-xs font-medium",
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
                  ? ` · ${new Date(item.reviewed_at).toLocaleString("pt-BR")}`
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
