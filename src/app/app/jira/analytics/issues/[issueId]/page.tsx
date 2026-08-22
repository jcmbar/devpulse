import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DataTable } from "@/components/surface";
import { requirePermission } from "@/lib/auth/permissions";
import {
  formatDurationMs,
  inspectIssueFlow,
} from "@/services/analytics/jira";

type PageProps = {
  params: Promise<{ issueId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function JiraIssueFlowInspectionPage({
  params,
  searchParams,
}: PageProps) {
  await requirePermission("jira", "access");
  const { issueId } = await params;
  const query = searchParams ? await searchParams : {};
  const integrationId = firstParam(query.integrationId);

  if (!integrationId) {
    notFound();
  }

  const inspection = await inspectIssueFlow({ integrationId, issueId });
  if (!inspection) {
    notFound();
  }

  const { issue, metrics } = inspection;

  const backParams = new URLSearchParams();
  for (const key of [
    "integrationId",
    "teamId",
    "from",
    "to",
    "statusGroup",
    "issueType",
    "bucket",
  ]) {
    const value = firstParam(query[key]);
    if (value) {
      backParams.set(key, value);
    }
  }
  const backHref = `/app/jira/analytics?${backParams.toString()}`;

  return (
    <PageShell>
      <PageHeader
        title={`Auditoria · ${issue.jira_key}`}
        description={issue.summary ?? "Inspeção flow_v1 (somente leitura local)."}
        actions={
          <Link href={backHref} className="ui-btn-secondary">
            Voltar ao dashboard
          </Link>
        }
      />

      <div className="space-y-8">
        {inspection.warnings.length > 0 ? (
          <div className="ui-alert-error space-y-1">
            {inspection.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">Created</p>
            <p className="text-sm">{issue.created_at_jira ?? "—"}</p>
          </div>
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">Resolved</p>
            <p className="text-sm">{issue.resolved_at_jira ?? "—"}</p>
          </div>
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">Status atual</p>
            <p className="text-sm">
              {issue.status ?? "—"}{" "}
              <span className="text-muted-foreground">
                ({inspection.currentStatusClassification.group}/
                {inspection.currentStatusClassification.matchedBy})
              </span>
            </p>
          </div>
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">Assignee</p>
            <p className="text-sm">
              {issue.assignee_display_name ?? issue.assignee_account_id ?? "—"}
            </p>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">Lead time</p>
            <p className="ui-kpi text-xl">
              {formatDurationMs(metrics?.lead_time_ms)}
            </p>
          </div>
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">Aging</p>
            <p className="ui-kpi text-xl">
              {formatDurationMs(metrics?.aging_ms)}
            </p>
          </div>
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">First Develop</p>
            <p className="text-sm">{metrics?.first_develop_at ?? "—"}</p>
            <p className="ui-hint">
              {formatDurationMs(metrics?.time_to_first_develop_ms)} desde created
            </p>
          </div>
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">First Staging</p>
            <p className="text-sm">{metrics?.first_staging_at ?? "—"}</p>
            <p className="ui-hint">
              {formatDurationMs(metrics?.time_to_first_staging_ms)} desde created
            </p>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">Reopen</p>
            <p className="ui-kpi text-xl">{metrics?.reopen_count ?? "—"}</p>
          </div>
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">Develop reentry</p>
            <p className="ui-kpi text-xl">
              {metrics?.develop_reentry_count ?? "—"}
            </p>
          </div>
          <div className="ui-panel">
            <p className="text-xs text-muted-foreground">Assignee Δ</p>
            <p className="ui-kpi text-xl">
              {metrics?.assignee_change_count ?? "—"}
            </p>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="ui-form-section-title">Timeline de status</h2>
          <DataTable minWidthClassName="min-w-[800px]">
            <thead>
              <tr>
                <th>Quando</th>
                <th>De</th>
                <th>Para</th>
                <th>Grupos</th>
                <th>Match</th>
              </tr>
            </thead>
            <tbody>
              {inspection.statusTimeline.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground">
                    Sem eventos de status.
                  </td>
                </tr>
              ) : (
                inspection.statusTimeline.map((row) => (
                  <tr key={`${row.changed_at}-${row.from_status}-${row.to_status}`}>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {row.changed_at}
                    </td>
                    <td>{row.from_status ?? "—"}</td>
                    <td className="font-medium">{row.to_status ?? "—"}</td>
                    <td className="text-muted-foreground">
                      {row.from_group} → {row.to_group}
                    </td>
                    <td className="text-muted-foreground">
                      {row.from_match}/{row.to_match}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </section>

        <section className="space-y-3">
          <h2 className="ui-form-section-title">Timeline de assignee</h2>
          <DataTable minWidthClassName="min-w-[720px]">
            <thead>
              <tr>
                <th>Quando</th>
                <th>De</th>
                <th>Para</th>
              </tr>
            </thead>
            <tbody>
              {inspection.assigneeTimeline.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted-foreground">
                    Sem eventos de assignee.
                  </td>
                </tr>
              ) : (
                inspection.assigneeTimeline.map((row) => (
                  <tr key={`${row.changed_at}-${row.to_account_id}`}>
                    <td className="whitespace-nowrap text-muted-foreground">
                      {row.changed_at}
                    </td>
                    <td>
                      {row.from_display_name ?? row.from_account_id ?? "—"}
                    </td>
                    <td className="font-medium">
                      {row.to_display_name ?? row.to_account_id ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <h2 className="ui-form-section-title">Dwell por status</h2>
            <DataTable minWidthClassName="min-w-[420px]">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Grupo</th>
                  <th>Match</th>
                  <th>Tempo</th>
                </tr>
              </thead>
              <tbody>
                {inspection.dwellByStatus.map((row) => (
                  <tr key={row.status}>
                    <td>{row.status}</td>
                    <td>{row.group}</td>
                    <td className="text-muted-foreground">{row.matchedBy}</td>
                    <td className="tabular-nums">
                      {formatDurationMs(row.dwell_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
          <div className="space-y-3">
            <h2 className="ui-form-section-title">Dwell por grupo</h2>
            <DataTable minWidthClassName="min-w-[320px]">
              <thead>
                <tr>
                  <th>Grupo</th>
                  <th>Tempo</th>
                </tr>
              </thead>
              <tbody>
                {inspection.dwellByGroup.map((row) => (
                  <tr key={row.group}>
                    <td>{row.group}</td>
                    <td className="tabular-nums">
                      {formatDurationMs(row.dwell_ms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
