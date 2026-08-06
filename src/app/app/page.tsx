import { AppHome, type DeveloperHomeTab } from "@/app/app/app-home";
import { OnboardingForm } from "@/app/app/onboarding-form";
import { FilterPersistenceSync } from "@/components/filters/filter-persistence-sync";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import type { DeveloperClosingYearMonthRow } from "@/components/monthly-closing/developer-closings-year-view";
import { getAppContext } from "@/lib/auth/app-context";
import { restorePersistedFiltersOrRedirect } from "@/lib/filters/persist-server";
import {
  endOfMonth,
  listYearMonthsBetween,
  resolveCompiladoDateRange,
  startOfMonth,
} from "@/lib/metrics/date-range";
import { computeDeveloperPeriodMetrics } from "@/lib/metrics/developer-period";
import { buildMonthlyTrendFromCards } from "@/lib/metrics/monthly-trend";
import { findUnlinkedDeveloperByEmail } from "@/services/developers";
import { resolveCompiladoSnapshot } from "@/services/compilado/resolve-snapshot";
import { listDelayJustificationsForDeveloperImport } from "@/services/delay-justifications";
import { getCurrentDeveloperCompensation } from "@/services/developers/compensation";
import { listJiraCardsByDeveloperAndImport } from "@/services/jira-cards";
import { getInvoiceIssuer } from "@/services/invoice-issuers";
import { listApplicableHolidayDatesForDeveloperMonth } from "@/services/holidays";
import {
  getMealPixClosingBlockReason,
  getMonthlyClosingForDeveloperMonth,
  listMonthlyClosingAttachments,
  listMonthlyClosingItems,
  listMonthlyClosingsForDeveloperYear,
  loadMonthlyClosingAuditForDeveloper,
} from "@/services/monthly-closings";
import type { DeveloperCompensation } from "@/types/developer-compensation";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import type {
  MonthlyClosingAttachment,
  MonthlyClosingCardAuditRow,
} from "@/types/monthly-closing";

type AppPageProps = {
  searchParams: Promise<{
    importId?: string;
    from?: string;
    to?: string;
    month?: string;
    tab?: string;
    closingYear?: string;
    detailMonth?: string;
  }>;
};

function parseTab(value: string | undefined): DeveloperHomeTab {
  return value === "fechamentos" ? "fechamentos" : "cards";
}

function buildAppHref(input: {
  tab: DeveloperHomeTab;
  importId?: string | null;
  month?: string | null;
  from?: string | null;
  to?: string | null;
  closingYear?: number | null;
  detailMonth?: string | null;
}): string {
  const params = new URLSearchParams();
  // `tab` is a durable filter: omitting it lets the persisted cookie win and
  // the restore redirect sends the user back to the previous tab.
  params.set("tab", input.tab);
  if (input.importId) {
    params.set("importId", input.importId);
  }
  if (input.tab === "cards") {
    if (input.month) {
      params.set("month", input.month);
    }
    if (input.from) {
      params.set("from", input.from);
    }
    if (input.to) {
      params.set("to", input.to);
    }
  }
  if (input.tab === "fechamentos") {
    if (input.closingYear != null) {
      params.set("closingYear", String(input.closingYear));
    }
    if (input.detailMonth) {
      params.set("detailMonth", input.detailMonth);
    }
  }
  const query = params.toString();
  return query ? `/app?${query}` : "/app";
}

export default async function AppPage({ searchParams }: AppPageProps) {
  const { profile, developer } = await getAppContext();

  if (!developer) {
    const linkCandidate = await findUnlinkedDeveloperByEmail(profile.email);

    return (
      <PageShell size="sm">
        <PageHeader
          title="Configure sua área"
          description="Complete seu nome e vincule ou crie seu registro de developer para continuar."
        />
        <Surface>
          <OnboardingForm profile={profile} linkCandidate={linkCandidate} />
        </Surface>
      </PageShell>
    );
  }

  const params = await searchParams;
  await restorePersistedFiltersOrRedirect({
    scope: "developer-home",
    pathname: "/app",
    searchParams: params,
  });
  const activeTab = parseTab(params.tab);

  // Scope Compilado to the developer's team. Without this, auto picks the
  // newest Jira batch of *any* team (e.g. Projetos Especiais) and everyone
  // else sees 0 cards for months that exist only in their own team snapshot.
  const developerTeamId = developer.team_id;

  const seed = await resolveCompiladoSnapshot({
    mode: "auto",
    importId: null,
    dateRange: null,
    teamId: developerTeamId,
  });

  const dateRange = resolveCompiladoDateRange({
    searchParams: {
      from: params.from,
      to: params.to,
      month: params.month,
    },
    defaultStart: seed.selectedBatch?.period_start ?? null,
    defaultEnd: seed.selectedBatch?.period_end ?? null,
  });

  const resolved = await resolveCompiladoSnapshot({
    mode: "auto",
    importId: null,
    dateRange,
    teamId: developerTeamId,
  });

  const selectedBatch = resolved.selectedBatch;
  const selectedImportId = selectedBatch?.id ?? null;

  const monthOptions =
    selectedBatch?.period_start && selectedBatch.period_end
      ? listYearMonthsBetween(
          selectedBatch.period_start,
          selectedBatch.period_end,
        )
      : listYearMonthsBetween(dateRange.start, dateRange.end);

  const cards =
    selectedBatch != null
      ? await listJiraCardsByDeveloperAndImport({
          developerId: developer.id,
          importId: selectedBatch.id,
          rangeStart: dateRange.start,
          rangeEnd: dateRange.end,
        })
      : [];

  const justifications =
    selectedBatch != null
      ? await listDelayJustificationsForDeveloperImport({
          importId: selectedBatch.id,
          developerId: developer.id,
          kind: "all",
        })
      : [];

  const acceptedDelayKeys = justifications
    .filter((row) => row.kind === "delay" && row.status === "accepted")
    .map((row) => row.jira_key);
  const acceptedReworkKeys = justifications
    .filter((row) => row.kind === "rework" && row.status === "accepted")
    .map((row) => row.jira_key);

  function toBadge(row: (typeof justifications)[number]) {
    return {
      id: row.id,
      status: row.status,
      developerNote: row.developer_note,
      reviewerNote: row.reviewer_note,
    };
  }

  const delayJustificationsByKey = Object.fromEntries(
    justifications
      .filter((row) => row.kind === "delay")
      .map((row) => [row.jira_key.trim().toUpperCase(), toBadge(row)]),
  );
  const reworkJustificationsByKey = Object.fromEntries(
    justifications
      .filter((row) => row.kind === "rework")
      .map((row) => [row.jira_key.trim().toUpperCase(), toBadge(row)]),
  );

  const metrics = computeDeveloperPeriodMetrics(cards, {
    acceptedDelayKeys,
    acceptedReworkKeys,
  });

  const monthlyTrend = buildMonthlyTrendFromCards(cards, {
    acceptedDelayKeys,
    acceptedReworkKeys,
  });

  const yearFromOptions = monthOptions.map((m) => Number(m.slice(0, 4)));
  const closingYears = [
    ...new Set([
      ...yearFromOptions,
      new Date().getUTCFullYear(),
      ...(params.closingYear ? [Number(params.closingYear)] : []),
    ]),
  ]
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => a - b);

  const defaultClosingYear =
    dateRange.month != null
      ? Number(dateRange.month.slice(0, 4))
      : (closingYears[closingYears.length - 1] ?? new Date().getUTCFullYear());

  const closingSelectedYear = Number.isFinite(Number(params.closingYear))
    ? Number(params.closingYear)
    : defaultClosingYear;

  const closingDetailMonth =
    activeTab === "fechamentos" &&
    params.detailMonth &&
    /^\d{4}-\d{2}$/.test(params.detailMonth)
      ? params.detailMonth
      : null;

  let closingYearRows: DeveloperClosingYearMonthRow[] = [];
  if (activeTab === "fechamentos") {
    const yearMonths = Array.from({ length: 12 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0");
      return `${closingSelectedYear}-${month}`;
    });

    const [yearClosings, yearCards] = await Promise.all([
      listMonthlyClosingsForDeveloperYear({
        developerId: developer.id,
        year: closingSelectedYear,
      }),
      selectedImportId != null
        ? listJiraCardsByDeveloperAndImport({
            developerId: developer.id,
            importId: selectedImportId,
            rangeStart: startOfMonth(`${closingSelectedYear}-01`),
            rangeEnd: endOfMonth(`${closingSelectedYear}-12`),
          })
        : Promise.resolve([]),
    ]);

    const closingByMonth = new Map(
      yearClosings.map((row) => [row.year_month, row]),
    );

    closingYearRows = yearMonths.map((yearMonth) => {
      const monthCards = yearCards.filter(
        (card) =>
          card.unit_test_delivery_on != null &&
          card.unit_test_delivery_on.slice(0, 7) === yearMonth,
      );
      return {
        yearMonth,
        metrics: computeDeveloperPeriodMetrics(monthCards, {
          acceptedDelayKeys,
          acceptedReworkKeys,
        }),
        closing: closingByMonth.get(yearMonth) ?? null,
      };
    });
  }

  const closingYearMonth = closingDetailMonth;

  const monthlyClosing =
    closingYearMonth != null
      ? await getMonthlyClosingForDeveloperMonth({
          developerId: developer.id,
          yearMonth: closingYearMonth,
        })
      : null;

  let closingAuditRows: MonthlyClosingCardAuditRow[] = [];
  let closingCanSubmit = false;
  let closingBlockingCount = 0;
  let closingAttachments: MonthlyClosingAttachment[] = [];

  if (
    closingYearMonth != null &&
    selectedImportId != null &&
    monthlyClosing != null &&
    monthlyClosing.started_at != null
  ) {
    if (
      monthlyClosing.status === "in_review" ||
      monthlyClosing.status === "closed" ||
      monthlyClosing.status === "finalized"
    ) {
      const [items, attachments] = await Promise.all([
        listMonthlyClosingItems(monthlyClosing.id),
        listMonthlyClosingAttachments(monthlyClosing.id),
      ]);
      closingAttachments = attachments;
      closingAuditRows = items.map((item) => ({
        cardId: item.jira_card_id ?? item.id,
        jiraKey: item.jira_key,
        summary: item.summary,
        status: item.status_name,
        estimateHours: item.estimate_hours,
        actualHours: item.actual_hours,
        delayDays: item.delay_days,
        isDelayed: item.is_delayed,
        isRework: item.is_rework,
        reworkWeight: item.rework_weight,
        dueOn: item.due_on,
        unitTestDeliveryOn: item.unit_test_delivery_on,
        delayJustification: {
          status: item.delay_justification_status,
          developerNote: item.delay_developer_note,
          managerNote: item.delay_manager_note,
        },
        reworkJustification: {
          status: item.rework_justification_status,
          developerNote: item.rework_developer_note,
          managerNote: item.rework_manager_note,
        },
        blocksSubmit: false,
        blockReasons: [],
      }));
    } else {
      const audit = await loadMonthlyClosingAuditForDeveloper({
        developerId: developer.id,
        importId: selectedImportId,
        yearMonth: closingYearMonth,
      });
      closingAuditRows = audit.auditRows;
      closingCanSubmit = audit.canSubmit;
      closingBlockingCount = audit.blockingCount;
    }
  } else if (
    closingYearMonth != null &&
    selectedImportId != null &&
    (monthlyClosing == null || monthlyClosing.started_at == null)
  ) {
    // Preview readiness before start when month detail is open.
    const audit = await loadMonthlyClosingAuditForDeveloper({
      developerId: developer.id,
      importId: selectedImportId,
      yearMonth: closingYearMonth,
    });
    closingAuditRows = audit.auditRows;
    closingCanSubmit = audit.canSubmit;
    closingBlockingCount = audit.blockingCount;
  }

  const developerCompensation: DeveloperCompensation | null =
    await getCurrentDeveloperCompensation(developer.id);

  const mealPixBlockReason =
    await getMealPixClosingBlockReason(developer.id);

  const closingInvoiceIssuer: InvoiceIssuer | null =
    monthlyClosing?.invoice_issuer_id
      ? await getInvoiceIssuer(monthlyClosing.invoice_issuer_id)
      : null;

  const closingHolidayEntries =
    closingYearMonth != null
      ? Array.from(
          (
            await listApplicableHolidayDatesForDeveloperMonth({
              developerId: developer.id,
              yearMonth: closingYearMonth,
            })
          ).byDate.entries(),
        ).map(([date, name]) => ({ date, name }))
      : [];

  const cardsTabHref = buildAppHref({
    tab: "cards",
    importId: selectedImportId,
    month: dateRange.mode === "month" ? dateRange.month : null,
    from: dateRange.mode === "custom" ? dateRange.start : null,
    to: dateRange.mode === "custom" ? dateRange.end : null,
  });

  const fechamentosTabHref = buildAppHref({
    tab: "fechamentos",
    importId: selectedImportId,
    closingYear: closingSelectedYear,
  });

  return (
    <>
      <FilterPersistenceSync
        scope="developer-home"
        params={{
          tab: activeTab,
          month: dateRange.mode === "month" ? dateRange.month : undefined,
          from: dateRange.mode === "custom" ? dateRange.start : undefined,
          to: dateRange.mode === "custom" ? dateRange.end : undefined,
          closingYear: String(closingSelectedYear),
        }}
      />
      <AppHome
        profile={profile}
        developer={developer}
        selectedImportId={selectedImportId}
        dateRange={dateRange}
        monthOptions={monthOptions}
        cards={cards}
        metrics={metrics}
        monthlyTrend={monthlyTrend}
        provenance={resolved.provenance}
        delayJustificationsByKey={delayJustificationsByKey}
        reworkJustificationsByKey={reworkJustificationsByKey}
        activeTab={activeTab}
        cardsTabHref={cardsTabHref}
        fechamentosTabHref={fechamentosTabHref}
        closingYears={closingYears}
        closingSelectedYear={closingSelectedYear}
        closingYearRows={closingYearRows}
        closingDetailMonth={closingDetailMonth}
        monthlyClosing={monthlyClosing}
        closingAuditRows={closingAuditRows}
        closingCanSubmit={closingCanSubmit}
        closingBlockingCount={closingBlockingCount}
        closingAttachments={closingAttachments}
        developerCompensation={developerCompensation}
        closingInvoiceIssuer={closingInvoiceIssuer}
        closingHolidays={closingHolidayEntries}
        mealPixBlockReason={mealPixBlockReason}
      />
    </>
  );
}
