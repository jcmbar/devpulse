"use client";

import {
  buildSinteticoClipboardText,
  buildSinteticoTableModel,
  formatSinteticoMoney,
  formatSinteticoMoneyTotal,
  type SinteticoExportRow,
} from "@/lib/folha/sintetico-table";
import { X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

export function PayrollSinteticoExportButton({
  yearMonth,
  periodStart,
  periodEnd,
  rows,
}: {
  yearMonth: string;
  periodStart: string;
  periodEnd: string;
  rows: SinteticoExportRow[];
}) {
  const [open, setOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const reviewedCount = rows.length;
  const titleId = useId();

  const model = buildSinteticoTableModel({
    yearMonth,
    periodStart,
    periodEnd,
    rows,
  });

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function copyTable() {
    setCopyError(null);
    setCopyMessage(null);
    try {
      await navigator.clipboard.writeText(buildSinteticoClipboardText(model));
      setCopyMessage("Tabela copiada. Cole no Excel ou Sheets.");
    } catch {
      setCopyError("Não foi possível copiar. Selecione a tabela e copie manualmente.");
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="ui-btn-primary text-sm"
          disabled={reviewedCount === 0}
          title={
            reviewedCount === 0
              ? "Marque ao menos uma pessoa como conferida para gerar o sintético."
              : `Abre o sintético com ${reviewedCount} pessoa(s) conferida(s).`
          }
          onClick={() => {
            setCopyError(null);
            setCopyMessage(null);
            setOpen(true);
          }}
        >
          Gerar Sintético
        </button>
        {reviewedCount === 0 ? (
          <span className="text-xs text-muted-foreground">
            Nenhum conferido neste mês
          </span>
        ) : (
          <span className="text-xs text-muted-foreground tabular-nums">
            {reviewedCount} conferido{reviewedCount === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
              <button
                type="button"
                aria-label="Fechar"
                className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative z-10 flex max-h-[min(92dvh,100%)] w-full min-w-0 max-w-6xl flex-col overflow-hidden rounded-t-[var(--radius)] border border-border bg-[var(--surface-elevated)] shadow-[var(--shadow-md)] sm:rounded-[var(--radius)]"
              >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                      Folha · financeiro
                    </p>
                    <h2
                      id={titleId}
                      className="text-base font-semibold tracking-tight"
                    >
                      Sintético · {model.monthTitle}
                    </h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Apenas pessoas marcadas como conferidas. Use “Copiar
                      tabela” para colar no Excel.
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      className="ui-btn-secondary text-sm"
                      onClick={() => {
                        void copyTable();
                      }}
                    >
                      Copiar tabela
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="inline-flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                      aria-label="Fechar"
                    >
                      <X className="size-4" strokeWidth={1.9} />
                    </button>
                  </div>
                </div>

                {(copyMessage || copyError) && (
                  <div className="shrink-0 border-b border-border px-4 py-2 sm:px-5">
                    {copyMessage ? (
                      <p className="text-xs text-muted-foreground">
                        {copyMessage}
                      </p>
                    ) : null}
                    {copyError ? (
                      <p className="text-xs text-destructive" role="alert">
                        {copyError}
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full min-w-[920px] border-collapse text-sm [&_th]:border [&_th]:border-border [&_td]:border [&_td]:border-border">
                      <thead>
                        <tr>
                          <th
                            colSpan={7}
                            className="bg-brand-soft px-3 py-3 text-center text-sm font-semibold tracking-tight text-brand-foreground capitalize"
                          >
                            {model.monthTitle}
                          </th>
                        </tr>
                        <tr className="bg-muted/25 text-center text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                          <th className="px-3 py-2 text-center">Nome</th>
                          <th className="px-3 py-2 text-center">Valor Base</th>
                          <th className="px-3 py-2 text-center">
                            Diferencial (+)
                          </th>
                          <th className="px-3 py-2 text-center">
                            Descontos (−)
                          </th>
                          <th colSpan={2} className="px-3 py-2 text-center">
                            Reembolso
                          </th>
                          <th className="px-3 py-2 text-center">
                            Valor da Nota Fiscal
                          </th>
                        </tr>
                        <tr className="bg-muted/10 text-center text-[11px] font-medium text-muted-foreground">
                          <th className="px-3 py-2" />
                          <th className="px-3 py-2" />
                          <th className="px-3 py-2" />
                          <th className="px-3 py-2" />
                          <th className="px-3 py-2 text-center font-normal normal-case">
                            {model.travelHeader}
                          </th>
                          <th className="px-3 py-2 text-center font-normal normal-case">
                            {model.mealHeader}
                          </th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {model.rows.map((row, index) => (
                          <tr key={`${row.developerName}-${index}`}>
                            <td className="px-3 py-2.5 text-center font-medium">
                              {row.developerName}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums">
                              {formatSinteticoMoney(row.baseAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums">
                              {formatSinteticoMoney(row.differentialAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums">
                              {formatSinteticoMoney(row.discountsAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums">
                              {formatSinteticoMoney(row.travelAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums">
                              {formatSinteticoMoney(row.mealAmount)}
                            </td>
                            <td className="px-3 py-2.5 text-center tabular-nums font-medium">
                              {formatSinteticoMoney(row.invoiceAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-brand-soft font-semibold text-brand-foreground">
                          <td className="px-3 py-2.5 text-center">Total</td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {formatSinteticoMoneyTotal(model.totals.base)}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {formatSinteticoMoneyTotal(
                              model.totals.differential,
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {formatSinteticoMoneyTotal(model.totals.discounts)}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {formatSinteticoMoneyTotal(model.totals.travel)}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {formatSinteticoMoneyTotal(model.totals.meal)}
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">
                            {formatSinteticoMoneyTotal(model.totals.invoice)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
