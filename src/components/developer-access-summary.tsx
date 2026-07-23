import { AccessStatusBadge } from "@/components/access-status-badge";
import {
  formatAccessDate,
  type DeveloperAccessInfo,
} from "@/services/auth/developer-access";

type DeveloperAccessSummaryProps = {
  access: DeveloperAccessInfo;
};

export function DeveloperAccessSummary({
  access,
}: DeveloperAccessSummaryProps) {
  const formattedDate = formatAccessDate(access.relevantAt);

  return (
    <div className="space-y-3 rounded-md border border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <AccessStatusBadge
          kind={access.kind}
          label={access.label}
          title={access.description}
        />
        {access.profileLinked ? (
          <span className="text-xs text-muted-foreground">Profile vinculado</span>
        ) : (
          <span className="text-xs text-muted-foreground">Sem vínculo de profile</span>
        )}
      </div>

      <p className="text-sm text-muted-foreground">{access.description}</p>

      <dl className="grid gap-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">E-mail</dt>
          <dd>{access.email ?? "—"}</dd>
        </div>
        {formattedDate && access.relevantAtLabel ? (
          <div className="flex gap-2">
            <dt className="text-muted-foreground">{access.relevantAtLabel}</dt>
            <dd>{formattedDate}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}
