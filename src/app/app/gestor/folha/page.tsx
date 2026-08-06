import Link from "next/link";
import { PayrollAttendancePanel } from "@/components/folha/payroll-attendance-panel";
import { PayrollItemEditor } from "@/components/folha/payroll-item-editor";
import { PayrollMonthStatusControl } from "@/components/folha/payroll-month-status";
import { PayrollSinteticoExportButton } from "@/components/folha/payroll-sintetico-export-button";
import { PayrollSyncFromCompensationButton } from "@/components/folha/payroll-sync-button";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { GestorTeamFilter } from "@/components/gestor-team-filter";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DataTable, EmptyState } from "@/components/surface";
import { AppViewTabs } from "@/components/ui/app-view-tabs";
import { FilterBar } from "@/components/ui/section-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import { buildGestorNavTabs } from "@/lib/gestor/nav-tabs";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import {
  computeContractedHoursDelta,
} from "@/lib/metrics/payroll-calc";
import {
  parseTeamListFilter,
  teamListFilterParam,
} from "@/lib/teams/team-filter";
import { listInvoiceIssuers } from "@/services/invoice-issuers";
import { mapFinalizedMonthlyClosingIdsByDeveloper } from "@/services/monthly-closings";
import {
  ensurePayrollMonthWithItems,
  getPayrollItem,
  listAttendanceForItem,
} from "@/services/payroll";
import { mapJiraDeliveryHoursByDeveloperForMonth } from "@/services/payroll/jira-hours";
import { listTeamsAdmin } from "@/services/teams";

type PageProps = {
  searchParams: Promise<{
    teamId?: string;
    month?: string;
    itemId?: string;
  }>;
};

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function parseYearMonth(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    return value;
  }
  return currentYearMonth();
}

function buildFolhaHref(input: {
  teamId?: string;
  month: string;
  itemId?: string | null;
}): string {
  const params = new URLSearchParams();
  if (input.teamId) {
    params.set("teamId", input.teamId);
  }
  params.set("month", input.month);
  if (input.itemId) {
    params.set("itemId", input.itemId);
  }
  const query = params.toString();
  return `/app/gestor/folha?${query}`;
}

export default async function GestorFolhaPage({ searchParams }: PageProps) {
  const { profile } = await requireTeamAccess();
  const params = await searchParams;
  await restorePersistedFiltersOrRedirect({
    scope: "gestor-folha",
    pathname: "/app/gestor/folha",
    searchParams: params,
  });

  const teamFilter = parseTeamListFilter(params.teamId);
  const selectedTeamId =
    teamFilter.kind === "team" ? teamFilter.teamId : null;
  const teamParam = teamListFilterParam(teamFilter) || undefined;
  const month = parseYearMonth(params.month);

  const [teams, issuers, payroll, finalizedByDeveloper] = await Promise.all([
    listTeamsAdmin(),
    listInvoiceIssuers({ activeOnly: true }),
    ensurePayrollMonthWithItems({
      yearMonth: month,
      createdBy: profile.id,
      teamId: selectedTeamId,
    }),
    mapFinalizedMonthlyClosingIdsByDeveloper(month),
  ]);

  const { closing, items } = payroll;
  const jiraHoursByDeveloper = await mapJiraDeliveryHoursByDeveloperForMonth({
    yearMonth: month,
    developers: items.map((item) => ({
      id: item.developer_id,
      teamId: item.team_id,
    })),
    teamId: selectedTeamId,
  });
  const selectedTeamName =
    selectedTeamId != null
      ? (teams.find((team) => team.id === selectedTeamId)?.name ?? null)
      : null;

  const selectedItemId = params.itemId?.trim() || null;
  const selectedItem =
    selectedItemId != null
      ? (items.find((item) => item.id === selectedItemId) ??
        (await getPayrollItem(selectedItemId)))
      : null;
  const attendanceDays =
    selectedItem != null
      ? await listAttendanceForItem(selectedItem.id)
      : [];

  const totals = items.reduce(
    (acc, item) => {
      acc.base += item.base_amount;
      acc.differential += item.differential_amount;
      acc.discounts += item.discounts_amount;
      acc.travel += item.travel_amount;
      acc.meal += item.meal_amount;
      acc.invoice += item.invoice_amount;
      acc.jiraHours += jiraHoursByDeveloper.get(item.developer_id) ?? 0;
      if (item.is_reviewed) {
        acc.reviewed += 1;
      }
      return acc;
    },
    {
      base: 0,
      differential: 0,
      discounts: 0,
      travel: 0,
      meal: 0,
      invoice: 0,
      jiraHours: 0,
      reviewed: 0,
    },
  );

  const readOnly = closing.status === "closed";
  const finalizedCount = items.filter((item) =>
    finalizedByDeveloper.has(item.developer_id),
  ).length;

  return (
    <PageShell size="full">
      <FilterPersistenceSync
        scope="gestor-folha"
        params={{
          teamId: teamParam,
          month,
        }}
      />
      <PageHeader
        eyebrow="Operação"
        title="Folha"
        description={
          <>
            Fechamento financeiro mensal
            {selectedTeamName ? (
              <>
                {" "}
                ·{" "}
                <span className="font-medium text-foreground">
                  {selectedTeamName}
                </span>
              </>
            ) : (
              " · todos os times"
            )}
            {" · "}
            <span className="font-medium text-foreground capitalize">
              {formatYearMonthLabel(month)}
            </span>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <PayrollSinteticoExportButton
              yearMonth={month}
              periodStart={closing.period_start}
              periodEnd={closing.period_end}
              rows={items
                .filter((item) => item.is_reviewed)
                .map((item) => ({
                  developerName: item.developer_name,
                  baseAmount: item.base_amount,
                  differentialAmount: item.differential_amount,
                  discountsAmount: item.discounts_amount,
                  travelAmount: item.travel_amount,
                  mealAmount: item.meal_amount,
                  invoiceAmount: item.invoice_amount,
                }))}
            />
            <PayrollSyncFromCompensationButton
              yearMonth={month}
              teamId={selectedTeamId}
            />
            <Link href="/app/gestor/folha/empresas" className="ui-btn-secondary">
              Empresas emissoras
            </Link>
            <Link
              href="/app/gestor/config#feriados"
              className="ui-btn-secondary"
              title="Cadastro global de feriados aplicados na Folha e no Fechamento"
            >
              Feriados
            </Link>
            <Link href="/app/gestor" className="ui-btn-secondary">
              Voltar ao dashboard
            </Link>
          </div>
        }
      />

      <AppViewTabs
        tabs={buildGestorNavTabs({
          active: "folha",
          teamId: teamParam,
          month,
        })}
      />

      <FilterBar>
        <div className="ui-filter-bar__fields md:grid-cols-3">
          <div className="ui-filter-bar__field">
            <p className="ui-filter-bar__label">Time</p>
            <GestorTeamFilter
              basePath="/app/gestor/folha"
              teams={teams}
              selectedTeamId={selectedTeamId}
              preservedParams={{ month }}
              persistScope="gestor-folha"
              embedded
            />
          </div>
          <div className="ui-filter-bar__field">
            <p className="ui-filter-bar__label">Mês</p>
            <form className="flex gap-2">
              {teamParam ? (
                <input type="hidden" name="teamId" value={teamParam} />
              ) : null}
              <input
                type="month"
                name="month"
                defaultValue={month}
                className="ui-input"
              />
              <button type="submit" className="ui-btn-secondary text-sm">
                Aplicar
              </button>
            </form>
          </div>
          <div className="ui-filter-bar__field">
            <p className="ui-filter-bar__label">Fechamento</p>
            <PayrollMonthStatusControl closing={closing} />
          </div>
        </div>
      </FilterBar>

      {selectedItem ? (
        <PayrollAttendancePanel
          item={selectedItem}
          days={attendanceDays}
          closeHref={buildFolhaHref({ teamId: teamParam, month })}
          readOnly={
            readOnly || finalizedByDeveloper.has(selectedItem.developer_id)
          }
          finalizedClosingId={
            finalizedByDeveloper.get(selectedItem.developer_id) ?? null
          }
        />
      ) : null}

      <section className="ui-dashboard-panel space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Sintético mensal</h2>
            <p className="text-sm text-muted-foreground">
              Base + diferencial − descontos + deslocamento + refeição = valor
              NF. Total horas Jira = mesma fonte do Gestor (time spent dos cards
              com entrega no mês), agregando o lote Compilado de cada time quando
              o filtro é “todos”. Diferença contratada = horas Jira − horas/mês
              do cadastro (negativo = abaixo do mínimo; base para futuro banco
              de horas).
            </p>
            {finalizedCount > 0 ? (
              <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                {finalizedCount} linha(s) com fechamento mensal finalizado —
                edição bloqueada. Reabra o fechamento para alterar.
              </p>
            ) : null}
          </div>
          <div className="space-y-1 text-right">
            <p className="text-sm font-medium tabular-nums">
              Total NF:{" "}
              {totals.invoice.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
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
                <th>Total horas Jira</th>
                <th>Diferença contratada</th>
                <th colSpan={5}>Valores do mês / NF</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const jiraHours =
                  jiraHoursByDeveloper.get(item.developer_id) ?? 0;
                const finalizedClosingId =
                  finalizedByDeveloper.get(item.developer_id) ?? null;
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
                    attendanceHref={buildFolhaHref({
                      teamId: teamParam,
                      month,
                      itemId: item.id,
                    })}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="font-medium">Totais</td>
                <td className="tabular-nums font-medium">
                  {totals.base.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
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
                  Dif.{" "}
                  {totals.differential.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  · Desc.{" "}
                  {totals.discounts.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  · Desl.{" "}
                  {totals.travel.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  · Ref.{" "}
                  {totals.meal.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}{" "}
                  · NF{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {totals.invoice.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </span>
                </td>
              </tr>
            </tfoot>
          </DataTable>
        )}
      </section>
    </PageShell>
  );
}
