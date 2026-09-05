import Link from "next/link";
import { PayrollMonthStatusControl } from "@/components/folha/payroll-month-status";
import { PayrollSinteticoExportButton } from "@/components/folha/payroll-sintetico-export-button";
import { PayrollSinteticoPanel } from "@/components/folha/payroll-sintetico-panel";
import { PayrollSyncFromCompensationButton } from "@/components/folha/payroll-sync-button";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { GestorTeamFilter } from "@/components/gestor-team-filter";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { AppViewTabs } from "@/components/ui/app-view-tabs";
import { FilterBar } from "@/components/ui/section-shell";
import { requirePermission } from "@/lib/auth/permissions";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import { buildGestorNavTabs } from "@/lib/gestor/nav-tabs";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import {
  parseTeamListFilter,
  teamListFilterParam,
} from "@/lib/teams/team-filter";
import { listInvoiceIssuers } from "@/services/invoice-issuers";
import { mapFinalizedMonthlyClosingIdsByDeveloper } from "@/services/monthly-closings";
import { ensurePayrollMonthWithItems } from "@/services/payroll";
import { mapJiraDeliveryHoursByDeveloperForMonth } from "@/services/payroll/jira-hours";
import { listDevelopersAdmin } from "@/services/developers/admin";
import { developerAvatarPublicUrl } from "@/services/developers/avatar";
import { listTeamsAdmin } from "@/services/teams";

type TriFilter = "all" | "yes" | "no";

type PageProps = {
  searchParams: Promise<{
    teamId?: string;
    month?: string;
    reviewed?: string;
    closing?: string;
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

function parseTriFilter(value: string | undefined): TriFilter {
  if (value === "yes" || value === "no") {
    return value;
  }
  return "all";
}

export default async function GestorFolhaPage({ searchParams }: PageProps) {
  const { profile } = await requirePermission("gestor", "access");
  const params = await searchParams;
  await restorePersistedFiltersOrRedirect({
    scope: "gestor-folha",
    pathname: "/app/gestor/folha",
    searchParams: params,
  });

  const teamFilter = parseTeamListFilter(params.teamId);
  const selectedTeamId =
    teamFilter.kind === "team" ? teamFilter.teamId : null;
  const teamParam = teamListFilterParam(teamFilter);
  const month = parseYearMonth(params.month);
  const reviewedFilter = parseTriFilter(params.reviewed);
  const closingFilter = parseTriFilter(params.closing);
  const initialAttendanceItemId = params.itemId?.trim() || null;

  const [teams, issuers, payroll, finalizedByDeveloper, developers] =
    await Promise.all([
      listTeamsAdmin(),
      listInvoiceIssuers({ activeOnly: true }),
      ensurePayrollMonthWithItems({
        yearMonth: month,
        createdBy: profile.id,
        teamId: selectedTeamId,
      }),
      mapFinalizedMonthlyClosingIdsByDeveloper(month),
      listDevelopersAdmin(
        selectedTeamId != null ? { teamId: selectedTeamId } : undefined,
      ),
    ]);

  const { closing, items: allItems } = payroll;
  const items = allItems.filter((item) => {
    if (reviewedFilter === "yes" && !item.is_reviewed) {
      return false;
    }
    if (reviewedFilter === "no" && item.is_reviewed) {
      return false;
    }
    const isFinalized = finalizedByDeveloper.has(item.developer_id);
    if (closingFilter === "yes" && !isFinalized) {
      return false;
    }
    if (closingFilter === "no" && isFinalized) {
      return false;
    }
    return true;
  });
  const avatarUrlByDeveloper = Object.fromEntries(
    developers.map((developer) => [
      developer.id,
      developerAvatarPublicUrl(developer.avatar_path),
    ]),
  );
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

  const readOnly = closing.status === "closed";

  const sinteticoTotals = items.reduce(
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
  const sinteticoFinalizedCount = items.filter((item) =>
    finalizedByDeveloper.has(item.developer_id),
  ).length;

  return (
    <PageShell size="full">
      <FilterPersistenceSync
        scope="gestor-folha"
        params={{
          teamId: teamParam,
          month,
          reviewed: reviewedFilter,
          closing: closingFilter,
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
            {reviewedFilter === "yes" ? " · conferidos" : null}
            {reviewedFilter === "no" ? " · não conferidos" : null}
            {closingFilter === "yes" ? " · fechamento finalizado" : null}
            {closingFilter === "no" ? " · sem fechamento finalizado" : null}
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PayrollMonthStatusControl closing={closing} />
            <PayrollSinteticoExportButton
              yearMonth={month}
              periodStart={closing.period_start}
              periodEnd={closing.period_end}
              rows={allItems
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
          reviewed: reviewedFilter,
        })}
      />

      <FilterBar>
        <div className="ui-filter-bar__row">
          <div className="ui-filter-bar__fields min-w-0 flex-1 md:grid-cols-2 xl:grid-cols-4">
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Time</p>
              <GestorTeamFilter
                basePath="/app/gestor/folha"
                teams={teams}
                selectedTeamId={selectedTeamId}
                preservedParams={{
                  month,
                  reviewed:
                    reviewedFilter === "all" ? undefined : reviewedFilter,
                  closing:
                    closingFilter === "all" ? undefined : closingFilter,
                }}
                persistScope="gestor-folha"
                embedded
                form="folha-month-filter"
              />
            </div>
            <div className="ui-filter-bar__field">
              <p className="ui-filter-bar__label">Mês</p>
              <input
                form="folha-month-filter"
                type="month"
                name="month"
                defaultValue={month}
                className="ui-input"
              />
            </div>
            <div className="ui-filter-bar__field">
              <label className="ui-filter-bar__label" htmlFor="folha-closing">
                Fechamento
              </label>
              <select
                id="folha-closing"
                form="folha-month-filter"
                name="closing"
                defaultValue={closingFilter}
                className="ui-select w-full min-w-0"
              >
                <option value="all">Todos</option>
                <option value="yes">Finalizado</option>
                <option value="no">Não finalizado</option>
              </select>
            </div>
            <div className="ui-filter-bar__field">
              <label className="ui-filter-bar__label" htmlFor="folha-reviewed">
                Conferido
              </label>
              <select
                id="folha-reviewed"
                form="folha-month-filter"
                name="reviewed"
                defaultValue={reviewedFilter}
                className="ui-select w-full min-w-0"
              >
                <option value="all">Todos</option>
                <option value="yes">Conferido</option>
                <option value="no">Não conferido</option>
              </select>
            </div>
          </div>
          <form
            id="folha-month-filter"
            className="flex shrink-0 justify-end sm:ml-auto"
          >
            <button type="submit" className="ui-btn-secondary shrink-0">
              Aplicar
            </button>
          </form>
        </div>
      </FilterBar>

      <PayrollSinteticoPanel
        items={items}
        issuers={issuers}
        readOnly={readOnly}
        totals={sinteticoTotals}
        finalizedCount={sinteticoFinalizedCount}
        teamId={teamParam}
        month={month}
        jiraHoursByDeveloper={Object.fromEntries(jiraHoursByDeveloper)}
        finalizedByDeveloper={Object.fromEntries(finalizedByDeveloper)}
        avatarUrlByDeveloper={avatarUrlByDeveloper}
        initialAttendanceItemId={initialAttendanceItemId}
      />
    </PageShell>
  );
}
