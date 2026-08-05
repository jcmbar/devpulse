"use client";

import {
  updatePayrollItemAction,
  type PayrollFormState,
} from "@/app/app/gestor/folha/actions";
import { FormFeedback } from "@/components/ui/form";
import {
  COMPENSATION_BASE_TYPE_LABELS,
} from "@/types/developer-compensation";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type { PayrollClosingItemWithIssuer } from "@/types/payroll-closing";
import Link from "next/link";
import { useActionState } from "react";

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

export function PayrollItemEditor({
  item,
  issuers,
  attendanceHref,
  readOnly = false,
}: PayrollItemEditorProps) {
  const [state, formAction, isPending] = useActionState(
    updatePayrollItemAction,
    initialState,
  );

  return (
    <tr>
      <td className="align-top">
        <div className="space-y-1">
          <p className="font-medium text-foreground">{item.developer_name}</p>
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
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">
                Diferencial
                {item.differential_manual ? " · manual" : ""}
              </span>
              <input
                name="differentialAmount"
                type="text"
                inputMode="decimal"
                defaultValue={moneyInputValue(item.differential_amount)}
                disabled={readOnly || isPending}
                className="ui-input text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Descontos</span>
              <input
                name="discountsAmount"
                type="text"
                inputMode="decimal"
                defaultValue={moneyInputValue(item.discounts_amount)}
                disabled={readOnly || isPending}
                className="ui-input text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">
                Deslocamento
                {item.travel_manual ? " · manual" : ""}
              </span>
              <input
                name="travelAmount"
                type="text"
                inputMode="decimal"
                defaultValue={moneyInputValue(item.travel_amount)}
                disabled={readOnly || isPending}
                className="ui-input text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">
                Refeição
                {item.meal_manual ? " · manual" : ""}
              </span>
              <input
                name="mealAmount"
                type="text"
                inputMode="decimal"
                defaultValue={moneyInputValue(item.meal_amount)}
                disabled={readOnly || isPending}
                className="ui-input text-sm"
              />
            </label>
            <label className="space-y-1 text-xs">
              <span className="text-muted-foreground">Empresa NF</span>
              <select
                name="invoiceIssuerId"
                defaultValue={item.invoice_issuer_id ?? ""}
                disabled={readOnly || isPending}
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
              <button
                type="submit"
                className="ui-btn-secondary text-xs"
                disabled={isPending}
              >
                {isPending ? "Salvando..." : "Salvar linha"}
              </button>
            ) : null}
            <FormFeedback error={state.error} success={state.success} />
          </div>
        </form>
      </td>
    </tr>
  );
}
