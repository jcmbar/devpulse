"use client";

import { PayrollItemEditor } from "@/components/folha/payroll-item-editor";
import { DataTable, EmptyState } from "@/components/surface";
import { computeContractedHoursDelta } from "@/lib/metrics/payroll-calc";
import { cn } from "@/lib/utils";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type { PayrollClosingItemWithIssuer } from "@/types/payroll-closing";
import { Eye, EyeOff } from "lucide-react";
import { useCallback, useState } from "react";

function formatMoney(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function MoneyVisibilityButton({
  visible,
  onToggle,
  label,
  size = "md",
}: {
  visible: boolean;
  onToggle: () => void;
  label: string;
  size?: "sm" | "md";
}) {
  const Icon = visible ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "inline-flex items-center justify-center rounded-[var(--radius-sm)] border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground",
        size === "sm" ? "size-7" : "size-8",
      )}
      aria-label={label}
      title={label}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
    </button>
  );
}

type Totals = {
  base: number;
  differential: number;
  discounts: number;
  travel: number;
  meal: number;
  invoice: number;
  jiraHours: number;
  reviewed: number;
};

type Props = {
  items: PayrollClosingItemWithIssuer[];
  issuers: InvoiceIssuer[];
  readOnly: boolean;
  totals: Totals;
  finalizedCount: number;
  /** When set, panel is scoped to presence editing for this person. */
  focusedDeveloperName?: string | null;
  teamId?: string;
  month: string;
  jiraHoursByDeveloper: Record<string, number>;
  finalizedByDeveloper: Record<string, string>;
};

function buildAttendanceHref(input: {
  teamId?: string;
  month: string;
  itemId: string;
}): string {
  const params = new URLSearchParams();
  if (input.teamId) {
    params.set("teamId", input.teamId);
  }
  params.set("month", input.month);
  params.set("itemId", input.itemId);
  return `/app/gestor/folha?${params.toString()}`;
}

export function PayrollSinteticoPanel({
  items,
  issuers,
  readOnly,
  totals,
  finalizedCount,
  focusedDeveloperName = null,
  teamId,
  month,
  jiraHoursByDeveloper,
  finalizedByDeveloper,
}: Props) {
  const [revealAll, setRevealAll] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());

  const toggleAll = useCallback(() => {
    setRevealAll((current) => {
      const next = !current;
      if (!next) {
        setRevealedIds(new Set());
      }
      return next;
    });
  }, []);

  const toggleRow = useCallback(
    (itemId: string) => {
      if (revealAll) {
        setRevealAll(false);
        setRevealedIds(
          new Set(items.map((item) => item.id).filter((id) => id !== itemId)),
        );
        return;
      }
      setRevealedIds((current) => {
        const next = new Set(current);
        if (next.has(itemId)) {
          next.delete(itemId);
        } else {
          next.add(itemId);
        }
        return next;
      });
    },
    [items, revealAll],
  );

  const isRowVisible = useCallback(
    (itemId: string) => revealAll || revealedIds.has(itemId),
    [revealAll, revealedIds],
  );

  return (
    <section className="ui-dashboard-panel space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">
              {focusedDeveloperName
                ? `Sintético · ${focusedDeveloperName}`
                : "Sintético mensal"}
            </h2>
            <MoneyVisibilityButton
              visible={revealAll}
              onToggle={toggleAll}
              label={
                revealAll
                  ? "Ocultar todos os valores"
                  : "Exibir todos os valores"
              }
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {focusedDeveloperName
              ? "Linha financeira desta pessoa no mês. Ajuste a presença acima e confira os valores NF aqui."
              : "Base + diferencial − descontos + deslocamento + refeição = valor NF. Total horas Jira = mesma fonte do Gestor (time spent dos cards com entrega no mês), agregando o lote Compilado de cada time quando o filtro é “todos”. Diferença contratada = horas Jira − horas/mês do cadastro (negativo = abaixo do mínimo; base para futuro banco de horas)."}
          </p>
          {finalizedCount > 0 ? (
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              {focusedDeveloperName
                ? "Fechamento mensal finalizado — edição bloqueada. Reabra o fechamento para alterar."
                : `${finalizedCount} linha(s) com fechamento mensal finalizado — edição bloqueada. Reabra o fechamento para alterar.`}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Valores monetários ficam ocultos por padrão. Use o olho
            {focusedDeveloperName ? "" : " geral ou o olho de cada pessoa"} para
            exibir.
          </p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-sm font-medium tabular-nums">
            {focusedDeveloperName ? "NF: " : "Total NF: "}
            {revealAll ? formatMoney(totals.invoice) : "R$ ••••"}
          </p>
          {!focusedDeveloperName && items.length > 0 ? (
            <p className="text-xs text-muted-foreground tabular-nums">
              Conferidos: {totals.reviewed}/{items.length}
            </p>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="Nenhuma pessoa neste filtro"
          description="Cadastre pessoas ativas no time ou remova o filtro de time."
        />
      ) : (
        <DataTable minWidthClassName="min-w-[1180px]" stickyFirstColumn>
          <thead>
            <tr>
              <th>Pessoa</th>
              <th>Base</th>
              <th>Total horas Jira</th>
              <th>Diferença contratada</th>
              <th colSpan={5}>Valores do mês / NF</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const jiraHours = jiraHoursByDeveloper[item.developer_id] ?? 0;
              const finalizedClosingId =
                finalizedByDeveloper[item.developer_id] ?? null;
              const moneyVisible = isRowVisible(item.id);
              return (
                <PayrollItemEditor
                  key={item.id}
                  item={item}
                  issuers={issuers}
                  readOnly={readOnly}
                  finalizedClosingId={finalizedClosingId}
                  jiraHours={jiraHours}
                  contractedHoursDelta={computeContractedHoursDelta({
                    jiraHours,
                    contractedHoursPerMonth: item.contracted_hours_per_month,
                  })}
                  attendanceHref={buildAttendanceHref({
                    teamId,
                    month,
                    itemId: item.id,
                  })}
                  moneyVisible={moneyVisible}
                  onToggleMoneyVisible={() => toggleRow(item.id)}
                />
              );
            })}
          </tbody>
          {focusedDeveloperName ? null : (
            <tfoot>
              <tr>
                <td className="font-medium">Totais</td>
                <td className="tabular-nums font-medium">
                  {revealAll ? formatMoney(totals.base) : "R$ ••••"}
                </td>
                <td className="tabular-nums font-medium">
                  {totals.jiraHours.toLocaleString("pt-BR", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                  })}{" "}
                  h
                </td>
                <td className="text-muted-foreground">—</td>
                <td colSpan={5} className="text-sm text-muted-foreground">
                  {revealAll ? (
                    <>
                      Dif. {formatMoney(totals.differential)} · Desc.{" "}
                      {formatMoney(totals.discounts)} · Desl.{" "}
                      {formatMoney(totals.travel)} · Ref.{" "}
                      {formatMoney(totals.meal)} · NF{" "}
                      <span className="font-medium text-foreground tabular-nums">
                        {formatMoney(totals.invoice)}
                      </span>
                    </>
                  ) : (
                    <>Dif. · Desc. · Desl. · Ref. · NF R$ ••••</>
                  )}
                </td>
              </tr>
            </tfoot>
          )}
        </DataTable>
      )}
    </section>
  );
}
