"use client";

import { PayrollAttendanceModal } from "@/components/folha/payroll-attendance-modal";
import { PayrollItemEditor } from "@/components/folha/payroll-item-editor";
import { DataTable, EmptyState } from "@/components/surface";
import { countMonthBusinessDaysExcludingHolidays } from "@/lib/metrics/business-days";
import { computeVariableCalendarHoursForDisplay } from "@/lib/metrics/closing-submit-values";
import { computeContractedHoursDelta } from "@/lib/metrics/payroll-calc";
import { cn } from "@/lib/utils";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type { PayrollClosingItemWithIssuer } from "@/types/payroll-closing";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  teamId?: string;
  month: string;
  jiraHoursByDeveloper: Record<string, number>;
  finalizedByDeveloper: Record<string, string>;
  avatarUrlByDeveloper?: Record<string, string | null>;
  /** Opens attendance modal on mount (deep-link from ?itemId=). */
  initialAttendanceItemId?: string | null;
};

export function PayrollSinteticoPanel({
  items,
  issuers,
  readOnly,
  totals,
  finalizedCount,
  month,
  jiraHoursByDeveloper,
  finalizedByDeveloper,
  avatarUrlByDeveloper = {},
  initialAttendanceItemId = null,
}: Props) {
  const router = useRouter();
  const [revealAll, setRevealAll] = useState(false);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());
  const [attendanceItemId, setAttendanceItemId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!initialAttendanceItemId) {
      return;
    }
    if (items.some((item) => item.id === initialAttendanceItemId)) {
      setAttendanceItemId(initialAttendanceItemId);
    }
  }, [initialAttendanceItemId, items]);

  const closeAttendance = useCallback(() => {
    setAttendanceItemId(null);
    if (typeof window === "undefined") {
      return;
    }
    const url = new URL(window.location.href);
    if (!url.searchParams.has("itemId")) {
      return;
    }
    url.searchParams.delete("itemId");
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, {
      scroll: false,
    });
  }, [router]);

  const monthBusinessDays = useMemo(
    () => countMonthBusinessDaysExcludingHolidays(month, new Set()),
    [month],
  );

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

  const attendanceItem =
    attendanceItemId != null
      ? (items.find((item) => item.id === attendanceItemId) ?? null)
      : null;

  return (
    <section className="ui-dashboard-panel space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">Sintético mensal</h2>
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
            Base + diferencial − descontos + deslocamento + refeição = valor NF.
            Total horas Jira = mesma fonte do Gestor (time spent dos cards com
            entrega no mês), agregando o lote Compilado de cada time quando o
            filtro é “todos”. Diferença contratada = horas Jira − horas/mês do
            cadastro (negativo = abaixo do mínimo; base para futuro banco de
            horas).
          </p>
          {finalizedCount > 0 ? (
            <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
              {finalizedCount} linha(s) com fechamento mensal finalizado —
              edição bloqueada. Reabra o fechamento para alterar.
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Valores monetários ficam ocultos por padrão. Use o olho geral ou o
            olho de cada pessoa para exibir.
          </p>
        </div>
        <div className="space-y-1 text-right">
          <p className="text-sm font-medium tabular-nums">
            Total NF: {revealAll ? formatMoney(totals.invoice) : "R$ ••••"}
          </p>
          {items.length > 0 ? (
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
              <th>Horas</th>
              <th>Diferença</th>
              <th colSpan={5}>Valores do mês / NF</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const jiraHours = jiraHoursByDeveloper[item.developer_id] ?? 0;
              const finalizedClosingId =
                finalizedByDeveloper[item.developer_id] ?? null;
              const moneyVisible = isRowVisible(item.id);
              const calendarHours = computeVariableCalendarHoursForDisplay({
                baseType: item.base_type,
                contractedHoursPerDay: item.contracted_hours_per_day,
                contractedHoursPerMonth: item.contracted_hours_per_month,
                hourlyRate: item.hourly_rate,
                yearMonth: month,
                calendarBusinessDays: monthBusinessDays,
                presencialDays: item.presencial_days_count,
              });
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
                  consideredHours={calendarHours?.consideredHours ?? null}
                  differentialHours={calendarHours?.differentialHours ?? null}
                  onOpenAttendance={() => setAttendanceItemId(item.id)}
                  moneyVisible={moneyVisible}
                  onToggleMoneyVisible={() => toggleRow(item.id)}
                  avatarUrl={avatarUrlByDeveloper[item.developer_id] ?? null}
                />
              );
            })}
          </tbody>
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
        </DataTable>
      )}

      {attendanceItem ? (
        <PayrollAttendanceModal
          item={attendanceItem}
          yearMonth={month}
          onClose={closeAttendance}
          readOnly={
            readOnly ||
            Boolean(finalizedByDeveloper[attendanceItem.developer_id])
          }
          finalizedClosingId={
            finalizedByDeveloper[attendanceItem.developer_id] ?? null
          }
          avatarUrl={
            avatarUrlByDeveloper[attendanceItem.developer_id] ?? null
          }
        />
      ) : null}
    </section>
  );
}
