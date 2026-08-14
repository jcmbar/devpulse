import Link from "next/link";
import { notFound } from "next/navigation";
import { ClosingJiraPostFinalizeDiffPanel } from "@/components/monthly-closing/closing-jira-post-finalize-diff";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { SectionShell } from "@/components/ui/section-shell";
import { requireTeamAccess } from "@/lib/auth/permissions";
import { formatYearMonthLabel } from "@/lib/metrics/date-range";
import { getDeveloperAdmin } from "@/services/developers/admin";
import {
  getClosingJiraPostFinalizeDiff,
  getMonthlyClosingById,
} from "@/services/monthly-closings";

type PageProps = {
  params: Promise<{ closingId: string }>;
};

export default async function ClosingJiraChangesPage({ params }: PageProps) {
  await requireTeamAccess();
  const { closingId } = await params;
  const closing = await getMonthlyClosingById(closingId);
  if (!closing) {
    notFound();
  }

  const [developer, diff] = await Promise.all([
    getDeveloperAdmin(closing.developer_id),
    getClosingJiraPostFinalizeDiff(closing.id),
  ]);

  return (
    <PageShell size="xl">
      <PageHeader
        eyebrow="Gestor · Fechamento"
        title="Alterações no Jira após o finalize"
        description={
          <>
            {developer?.full_name ?? "Developer"} ·{" "}
            {formatYearMonthLabel(closing.year_month)}. O snapshot do fechamento
            não muda — isto é só a diferença em relação ao Compilado atual.
          </>
        }
        breadcrumb={
          <Link
            href="/app/gestor/fechamentos"
            className="underline-offset-4 hover:underline"
          >
            ← Fechamentos
          </Link>
        }
        actions={
          <Link
            href={`/app/gestor/fechamentos/${closing.id}`}
            className="ui-btn-secondary"
          >
            Abrir fechamento
          </Link>
        }
      />

      <SectionShell
        title="O que mudou"
        description="Comparação campo a campo entre o card congelado no fechamento e o Jira atual do time."
      >
        {diff ? (
          <ClosingJiraPostFinalizeDiffPanel diff={diff} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Não foi possível montar a comparação deste fechamento.
          </p>
        )}
      </SectionShell>
    </PageShell>
  );
}
