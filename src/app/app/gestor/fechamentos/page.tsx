import Link from "next/link";
import { GestorClosingsInReviewSection } from "@/components/monthly-closing/gestor-closings-in-review";
import { GestorFechamentosOpsBoard } from "@/components/monthly-closing/gestor-fechamentos-ops-board";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { AppViewTabs } from "@/components/ui/app-view-tabs";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  buildFechamentoOpsCell,
  FECHAMENTO_OPS_STATUS_ORDER,
  type FechamentoOpsDeveloperData,
  type FechamentoOpsStatus,
} from "@/lib/fechamentos/ops-status";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import { buildGestorNavTabs } from "@/lib/gestor/nav-tabs";
import {
  parseTeamListFilter,
  teamListFilterParam,
} from "@/lib/teams/team-filter";
import { listCurrentCompensationsByDeveloperIds } from "@/services/developers/compensation";
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
    closingMonth?: string;
    view?: string;
    status?: string;
    q?: string;
  }>;
};

function parseOpsStatus(
  value: string | undefined,
): FechamentoOpsStatus | "all" {
  if (!value || value === "all") {
    return "all";
  }
  return FECHAMENTO_OPS_STATUS_ORDER.includes(value as FechamentoOpsStatus)
    ? (value as FechamentoOpsStatus)
    : "all";
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

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const closingSelectedYear = Number.isFinite(Number(params.closingYear))
    ? Number(params.closingYear)
    : currentYear;
  const closingSelectedMonthRaw = Number(params.closingMonth);
  const closingSelectedMonth =
    Number.isFinite(closingSelectedMonthRaw) &&
    closingSelectedMonthRaw >= 1 &&
    closingSelectedMonthRaw <= 12
      ? closingSelectedMonthRaw
      : currentMonth;
  const view = params.view === "year" ? "year" : "month";
  const statusFilter = parseOpsStatus(params.status);
  const query = String(params.q ?? "").trim();

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

  const [financeiroType, rhType, colaboradorType, compensations] =
    await Promise.all([
      getEmailSendTypeByCode("financeiro"),
      getEmailSendTypeByCode("rh"),
      getEmailSendTypeByCode("colaborador"),
      listCurrentCompensationsByDeveloperIds(
        matrixDevelopers.map((row) => row.id),
      ),
    ]);

  const dispatchByClosingAndType = new Map<
    string,
    { status: EmailDispatchStatus; errorMessage: string | null }
  >();
  if (yearClosingsReviewed.length > 0) {
    const dispatches = await listEmailDispatchesForClosings(
      yearClosingsReviewed.map((row) => row.id),
    );
    for (const row of dispatches) {
      dispatchByClosingAndType.set(
        `${row.monthly_closing_id}:${row.send_type_id}`,
        {
          status: row.status,
          errorMessage: row.error_message,
        },
      );
    }
  }

  function dispatchStatus(
    closingId: string,
    typeId: string | null | undefined,
  ): EmailDispatchStatus | null {
    if (!typeId) {
      return null;
    }
    return dispatchByClosingAndType.get(`${closingId}:${typeId}`)?.status ?? null;
  }

  function dispatchError(
    closingId: string,
    typeId: string | null | undefined,
  ): string | null {
    if (!typeId) {
      return null;
    }
    return (
      dispatchByClosingAndType.get(`${closingId}:${typeId}`)?.errorMessage ??
      null
    );
  }

  const closingsByDeveloper = new Map<string, typeof yearClosingsReviewed>();
  for (const closing of yearClosingsReviewed) {
    const list = closingsByDeveloper.get(closing.developer_id) ?? [];
    list.push(closing);
    closingsByDeveloper.set(closing.developer_id, list);
  }

  const boardDevelopers: FechamentoOpsDeveloperData[] = matrixDevelopers.map(
    (dev) => {
      const requireMealPix =
        compensations.get(dev.id)?.require_meal_pix_receipt ?? false;
      const cellsByMonth: FechamentoOpsDeveloperData["cellsByMonth"] = {};

      for (const closing of closingsByDeveloper.get(dev.id) ?? []) {
        const presence = attachmentPresence.get(closing.id) ?? null;
        cellsByMonth[closing.year_month] = buildFechamentoOpsCell({
          yearMonth: closing.year_month,
          closing,
          presence,
          financeiro: dispatchStatus(closing.id, financeiroType?.id),
          financeiroError: dispatchError(closing.id, financeiroType?.id),
          rh: dispatchStatus(closing.id, rhType?.id),
          colaborador: dispatchStatus(closing.id, colaboradorType?.id),
          requireMealPix,
        });
      }

      return {
        id: dev.id,
        fullName: dev.fullName,
        isActive: dev.isActive,
        requireMealPix,
        cellsByMonth,
      };
    },
  );

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

  return (
    <PageShell size="full">
      <FilterPersistenceSync
        scope="gestor-fechamentos"
        params={{
          teamId: teamParam,
          closingYear: String(closingSelectedYear),
          closingMonth: String(closingSelectedMonth),
        }}
      />
      <PageHeader
        eyebrow="Operação"
        title="Fechamento mensal"
        description="Acompanhe comprovantes, recibos e envios por developer"
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

      <GestorFechamentosOpsBoard
        year={closingSelectedYear}
        month={closingSelectedMonth}
        view={view}
        statusFilter={statusFilter}
        query={query}
        years={years}
        teams={teams}
        selectedTeamId={selectedTeamId}
        teamParam={teamParam}
        developers={boardDevelopers}
        sendTypeIds={{
          financeiroId: financeiroType?.id ?? null,
          rhId: rhType?.id ?? null,
          colaboradorId: colaboradorType?.id ?? null,
        }}
      />

      <GestorClosingsInReviewSection
        closings={filteredClosings}
        driftClosings={filteredDrift}
      />
    </PageShell>
  );
}
