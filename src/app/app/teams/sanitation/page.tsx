import Link from "next/link";
import {
  SanitationBackfillButton,
  SanitationHistoryTable,
  SanitationPendingTable,
} from "@/app/app/teams/sanitation/sanitation-panel";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { Surface } from "@/components/surface";
import { requireTeamAccess } from "@/lib/auth/permissions";
import {
  getSanitationSummary,
  listTeamAssignmentReviews,
} from "@/services/team-sanitation";
import { listTeamsAdmin } from "@/services/teams";

export default async function TeamSanitationPage() {
  await requireTeamAccess();

  const [summary, teams, pending, assigned] = await Promise.all([
    getSanitationSummary(),
    listTeamsAdmin({ includeInactive: true }),
    listTeamAssignmentReviews({ status: "pending" }),
    listTeamAssignmentReviews({ status: "all" }),
  ]);

  const pendingImports = pending.filter((row) => row.entity_type === "import");
  const pendingDevelopers = pending.filter(
    (row) => row.entity_type === "developer",
  );
  const history = assigned
    .filter(
      (row) =>
        row.status === "auto_assigned" || row.status === "manual_assigned",
    )
    .slice(0, 50);

  return (
    <PageShell size="full">
      <PageHeader
        eyebrow="Dados"
        title="Saneamento de team_id"
        description="Backfill seguro de imports e developers antigos. Só atribui quando a evidência é única; o restante fica pendente para revisão manual."
        breadcrumb={
          <Link href="/app/teams" className="underline-offset-4 hover:underline">
            ← Times
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Imports sem time", summary.importsWithoutTeam],
          ["Developers sem time", summary.developersWithoutTeam],
          ["Pendentes", summary.pendingReviews],
          ["Auto", summary.autoAssigned],
          ["Manual", summary.manualAssigned],
        ].map(([label, value]) => (
          <Surface key={String(label)} className="space-y-1">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tabular-nums">{value}</p>
          </Surface>
        ))}
      </section>

      <Surface>
        <SanitationBackfillButton />
      </Surface>

      <SanitationPendingTable
        title="Imports pendentes"
        rows={pendingImports}
        teams={teams}
        entityType="import"
      />
      <SanitationPendingTable
        title="Developers pendentes"
        rows={pendingDevelopers}
        teams={teams}
        entityType="developer"
      />
      <SanitationHistoryTable
        title="Histórico recente (auto + manual)"
        rows={history}
      />
    </PageShell>
  );
}
