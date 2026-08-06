import Link from "next/link";
import { GestorClosingsInReviewSection } from "@/components/monthly-closing/gestor-closings-in-review";
import { GestorClosingsYearMatrix } from "@/components/monthly-closing/gestor-closings-year-matrix";
import { GestorTeamFilter } from "@/components/gestor-team-filter";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { AppViewTabs } from "@/components/ui/app-view-tabs";
import { FilterBar } from "@/components/ui/section-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import { buildGestorNavTabs } from "@/lib/gestor/nav-tabs";
import {
  parseTeamListFilter,
  teamListFilterParam,
} from "@/lib/teams/team-filter";
import { listDevelopersAdmin } from "@/services/developers/admin";
import {
  listFinalizedClosingsWithJiraDrift,
  listMonthlyClosingAttachmentPresence,
  listMonthlyClosingsForGestorYear,
  listMonthlyClosingsInReview,
} from "@/services/monthly-closings";
import {
  getEmailSendTypeByCode,
  listEmailDispatchesForClosings,
} from "@/services/operational-emails";
import { listTeamsAdmin } from "@/services/teams";
import { listPayrollReviewedDeveloperMonthsForYear } from "@/services/payroll";
import type { EmailDispatchStatus } from "@/types/operational-email";

type PageProps = {
  searchParams: Promise<{
    teamId?: string;
    closingYear?: string;
  }>;
};

function buildFechamentosHref(input: {
  teamId?: string;
  closingYear?: number | null;
}): string {
  const params = new URLSearchParams();
  if (input.teamId) {
    params.set("teamId", input.teamId);
  }
  if (input.closingYear != null) {
    params.set("closingYear", String(input.closingYear));
  }
  const query = params.toString();
  return query
    ? `/app/gestor/fechamentos?${query}`
    : "/app/gestor/fechamentos";
}

export default async function GestorFechamentosPage({ searchParams }: PageProps) {
  await requireTeamAccess();
  const params = await searchParams;
  await restorePersistedFiltersOrRedirect({
    scope: "gestor-fechamentos",
    pathname: "/app/gestor/fechamentos",
    searchParams: params,
  });
  const teamFilter = parseTeamListFilter(params.teamId);
  const selectedTeamId =
    teamFilter.kind === "team" ? teamFilter.teamId : null;
  const teamParam = teamListFilterParam(teamFilter) || undefined;

  const currentYear = new Date().getUTCFullYear();
  const closingSelectedYear = Number.isFinite(Number(params.closingYear))
    ? Number(params.closingYear)
    : currentYear;

  const [
    teams,
    developers,
    yearClosings,
    closingsInReview,
    driftClosings,
    folhaReviewed,
  ] = await Promise.all([
    listTeamsAdmin(),
    listDevelopersAdmin({
      teamId: selectedTeamId,
      isActive: true,
    }),
    listMonthlyClosingsForGestorYear({
      year: closingSelectedYear,
      teamId: selectedTeamId,
    }),
    listMonthlyClosingsInReview({
      teamId: selectedTeamId,
      yearMonth: null,
    }),
    listFinalizedClosingsWithJiraDrift({
      teamId: selectedTeamId,
      yearMonth: null,
    }),
    listPayrollReviewedDeveloperMonthsForYear({
      year: closingSelectedYear,
      teamId: selectedTeamId,
    }),
  ]);

  const yearPrefix = `${closingSelectedYear}-`;
  const filteredClosings = closingsInReview.filter(
    (row) =>
      row.year_month.startsWith(yearPrefix) &&
      folhaReviewed.keys.has(`${row.developer_id}:${row.year_month}`),
  );
  const filteredDrift = driftClosings.filter(
    (row) =>
      row.year_month.startsWith(yearPrefix) &&
      folhaReviewed.keys.has(`${row.developer_id}:${row.year_month}`),
  );

  const developerIds = new Set(developers.map((row) => row.id));
  // Include inactive/unlisted developers who still have closings in the year.
  const extraDeveloperIds = [
    ...new Set(
      yearClosings
        .map((row) => row.developer_id)
        .filter((id) => !developerIds.has(id)),
    ),
  ];
  const extraDevelopers =
    extraDeveloperIds.length > 0
      ? (
          await listDevelopersAdmin()
        ).filter((row) => extraDeveloperIds.includes(row.id))
      : [];

  const matrixDevelopers = [
    ...developers.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      isActive: row.is_active,
    })),
    ...extraDevelopers.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      isActive: row.is_active,
    })),
  ]
    .filter((row) => folhaReviewed.developerIds.has(row.id))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "pt-BR"));

  const yearClosingsReviewed = yearClosings.filter((row) =>
    folhaReviewed.keys.has(`${row.developer_id}:${row.year_month}`),
  );

  const attachmentPresence = await listMonthlyClosingAttachmentPresence(
    yearClosingsReviewed
      .filter(
        (row) => row.status === "closed" || row.status === "finalized",
      )
      .map((row) => row.id),
  );

  const financeiroType = await getEmailSendTypeByCode("financeiro");
  const financeiroDispatchByClosingId = new Map<string, EmailDispatchStatus>();
  if (financeiroType) {
    const finalizedIds = yearClosingsReviewed
      .filter((row) => row.status === "finalized")
      .map((row) => row.id);
    const dispatches = await listEmailDispatchesForClosings(finalizedIds);
    for (const row of dispatches) {
      if (row.send_type_id === financeiroType.id) {
        financeiroDispatchByClosingId.set(row.monthly_closing_id, row.status);
      }
    }
  }

  const years = [
    ...new Set([
      currentYear,
      currentYear - 1,
      ...yearClosings.map((row) => Number(row.year_month.slice(0, 4))),
      ...closingsInReview.map((row) => Number(row.year_month.slice(0, 4))),
      ...driftClosings.map((row) => Number(row.year_month.slice(0, 4))),
    ]),
  ]
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => a - b);

  const selectedTeamName =
    selectedTeamId != null
      ? (teams.find((team) => team.id === selectedTeamId)?.name ?? null)
      : null;

  return (
    <PageShell size="full">
      <FilterPersistenceSync
        scope="gestor-fechamentos"
        params={{
          teamId: teamParam,
          closingYear: String(closingSelectedYear),
        }}
      />
      <PageHeader
        eyebrow="Operação"
        title="Fechamentos"
        description={
          <>
            Fila administrativa de fechamento mensal
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
            <span className="font-medium text-foreground">
              {closingSelectedYear}
            </span>
          </>
        }
        actions={
          <Link href="/app/gestor" className="ui-btn-secondary">
            Voltar ao dashboard
          </Link>
        }
      />

      <AppViewTabs
        tabs={buildGestorNavTabs({
          active: "fechamentos",
          teamId: teamParam,
          closingYear: closingSelectedYear,
        })}
      />

      <FilterBar>
        <div className="ui-filter-bar__fields md:grid-cols-2">
          <div className="ui-filter-bar__field">
            <p className="ui-filter-bar__label">Time</p>
            <GestorTeamFilter
              basePath="/app/gestor/fechamentos"
              teams={teams}
              selectedTeamId={selectedTeamId}
              preservedParams={{
                closingYear: String(closingSelectedYear),
              }}
              persistScope="gestor-fechamentos"
              embedded
            />
          </div>
          <div className="ui-filter-bar__field">
            <p className="ui-filter-bar__label">Ano</p>
            <div className="flex flex-wrap gap-1.5">
              {years.map((year) => (
                <Link
                  key={year}
                  href={buildFechamentosHref({
                    teamId: teamParam,
                    closingYear: year,
                  })}
                  className={
                    year === closingSelectedYear
                      ? "ui-btn-primary"
                      : "ui-btn-secondary"
                  }
                >
                  {year}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </FilterBar>

      <GestorClosingsYearMatrix
        year={closingSelectedYear}
        developers={matrixDevelopers}
        closings={yearClosingsReviewed}
        attachmentPresence={attachmentPresence}
        financeiroDispatchByClosingId={financeiroDispatchByClosingId}
      />

      <GestorClosingsInReviewSection
        closings={filteredClosings}
        driftClosings={filteredDrift}
      />
    </PageShell>
  );
}
