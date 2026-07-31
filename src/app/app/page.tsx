import { AppHome } from "@/app/app/app-home";
import { OnboardingForm } from "@/app/app/onboarding-form";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import { getAppContext } from "@/lib/auth/app-context";
import {
  listYearMonthsBetween,
  resolveCompiladoDateRange,
} from "@/lib/metrics/date-range";
import { computeDeveloperPeriodMetrics } from "@/lib/metrics/developer-period";
import { findUnlinkedDeveloperByEmail } from "@/services/developers";
import { resolveCompiladoSnapshot } from "@/services/compilado/resolve-snapshot";
import { listDelayJustificationsForDeveloperImport } from "@/services/delay-justifications";
import { listJiraCardsByDeveloperAndImport } from "@/services/jira-cards";
import {
  getMonthlyClosingForDeveloperMonth,
  listMonthlyClosingItems,
  loadMonthlyClosingAuditForDeveloper,
} from "@/services/monthly-closings";
import type { MonthlyClosingCardAuditRow } from "@/types/monthly-closing";

type AppPageProps = {
  searchParams: Promise<{
    importId?: string;
    from?: string;
    to?: string;
    month?: string;
  }>;
};

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

  // Home do developer: sempre snapshot automático (origem ativa).
  const seed = await resolveCompiladoSnapshot({
    mode: "auto",
    importId: null,
    dateRange: null,
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

  const closingYearMonth =
    dateRange.mode === "month" ? dateRange.month : null;

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
      const items = await listMonthlyClosingItems(monthlyClosing.id);
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
      closingCanSubmit = false;
      closingBlockingCount = 0;
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
  }

  return (
    <AppHome
      profile={profile}
      developer={developer}
      selectedImportId={selectedImportId}
      dateRange={dateRange}
      monthOptions={monthOptions}
      cards={cards}
      metrics={metrics}
      provenance={resolved.provenance}
      delayJustificationsByKey={delayJustificationsByKey}
      reworkJustificationsByKey={reworkJustificationsByKey}
      monthlyClosing={monthlyClosing}
      closingYearMonth={closingYearMonth}
      closingAuditRows={closingAuditRows}
      closingCanSubmit={closingCanSubmit}
      closingBlockingCount={closingBlockingCount}
    />
  );
}
