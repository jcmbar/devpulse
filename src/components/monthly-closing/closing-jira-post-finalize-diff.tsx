import Link from "next/link";
import { DataTable } from "@/components/surface";
import { formatDateTimeBrazil } from "@/lib/datetime/format-brazil";
import { cn } from "@/lib/utils";
import type { ClosingJiraPostFinalizeDiff } from "@/services/monthly-closings";

export function ClosingJiraPostFinalizeDiffPanel({
  diff,
  compact = false,
}: {
  diff: ClosingJiraPostFinalizeDiff;
  compact?: boolean;
}) {
  if (diff.cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        O alerta permanece, mas neste momento o Compilado Jira mais recente
        já está alinhado com o snapshot do fechamento.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <dl
        className={cn(
          "grid gap-3 text-sm",
          compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4",
        )}
      >
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Finalizado em
          </dt>
          <dd>{formatDateTimeBrazil(diff.finalizedAt)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Detectado em
          </dt>
          <dd>{formatDateTimeBrazil(diff.detectedAt)}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Cards alterados
          </dt>
          <dd>{diff.cards.length}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Compilado comparado
          </dt>
          <dd>
            {diff.liveImportCompletedAt
              ? formatDateTimeBrazil(diff.liveImportCompletedAt)
              : "Jira atual do time"}
          </dd>
        </div>
      </dl>

      <div className="space-y-3">
        {diff.cards.map((card) => (
          <article
            key={card.jiraKey}
            className="overflow-hidden rounded-[var(--radius)] border border-amber-500/35 bg-amber-500/[0.06]"
          >
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-amber-500/20 px-3 py-2.5">
              <div className="min-w-0">
                <p className="font-medium">
                  {card.jiraKey}
                  {card.snapshotSummary ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {card.snapshotSummary}
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-muted-foreground">
                  {card.kind === "missing"
                    ? "Não encontrado no Compilado Jira atual"
                    : "Valores diferentes do snapshot congelado no fechamento"}
                </p>
              </div>
            </header>
            {card.kind === "missing" ? null : (
              <DataTable minWidthClassName="min-w-[32rem]">
                <thead>
                  <tr>
                    <th>Campo</th>
                    <th>No fechamento</th>
                    <th>No Jira agora</th>
                  </tr>
                </thead>
                <tbody>
                  {card.changes.map((change) => (
                    <tr key={`${card.jiraKey}-${change.field}`}>
                      <td className="font-medium">{change.label}</td>
                      <td className="text-muted-foreground">{change.before}</td>
                      <td className="font-medium">{change.after}</td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </article>
        ))}
      </div>

      {compact ? (
        <p>
          <Link
            href={`/app/gestor/fechamentos/${diff.closingId}/alteracoes-jira`}
            className="text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Ver comparação completa
          </Link>
        </p>
      ) : null}
    </div>
  );
}
