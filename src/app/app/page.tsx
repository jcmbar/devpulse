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
import { listImportBatches } from "@/services/imports";
import { listJiraCardsByDeveloperAndImport } from "@/services/jira-cards";

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
  const batches = await listImportBatches();
  const selectedBatch =
    batches.find((batch) => batch.id === params.importId) ?? batches[0] ?? null;
  const selectedImportId = selectedBatch?.id ?? null;

  const dateRange = resolveCompiladoDateRange({
    searchParams: {
      from: params.from,
      to: params.to,
      month: params.month,
    },
    defaultStart: selectedBatch?.period_start ?? null,
    defaultEnd: selectedBatch?.period_end ?? null,
  });

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

  const metrics = computeDeveloperPeriodMetrics(cards);

  return (
    <AppHome
      profile={profile}
      developer={developer}
      batches={batches}
      selectedImportId={selectedImportId}
      dateRange={dateRange}
      monthOptions={monthOptions}
      cards={cards}
      metrics={metrics}
    />
  );
}
