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
        })
      : [];

  const acceptedDelayKeys = justifications
    .filter((row) => row.status === "accepted")
    .map((row) => row.jira_key);

  const delayJustificationsByKey = Object.fromEntries(
    justifications.map((row) => [
      row.jira_key.trim().toUpperCase(),
      {
        id: row.id,
        status: row.status,
        developerNote: row.developer_note,
        reviewerNote: row.reviewer_note,
      },
    ]),
  );

  const metrics = computeDeveloperPeriodMetrics(cards, {
    acceptedDelayKeys,
  });

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
    />
  );
}
