"use client";

import { DataTable } from "@/components/surface";
import { TeamSelect } from "@/components/team-select";
import {
  FormFeedback,
  FormSectionHeader,
} from "@/components/ui/form";
import { useActionState } from "react";
import {
  assignDeveloperTeamManualAction,
  assignImportTeamManualAction,
  runSanitationBackfillAction,
  type SanitationActionState,
} from "@/app/app/teams/sanitation/actions";
import type { PendingReviewRow } from "@/services/team-sanitation";
import type { Team } from "@/types/team";

const initialState: SanitationActionState = { error: null, success: null };

export function SanitationBackfillButton() {
  const [state, formAction, pending] = useActionState(
    runSanitationBackfillAction,
    initialState,
  );

  return (
    <div className="space-y-3">
      <form action={formAction}>
        <button type="submit" disabled={pending} className="ui-btn-primary">
          {pending
            ? "Executando backfill..."
            : "Rodar backfill automático seguro"}
        </button>
      </form>
      <FormFeedback error={state.error} success={state.success} />
      <p className="ui-hint">
        Só preenche quando a inferência é única e compatível com um time
        cadastrado. Nunca sobrescreve `team_id` existente. Gera auditoria em
        `team_assignment_reviews`.
      </p>
    </div>
  );
}

function ManualAssignForm({
  entityType,
  entityId,
  teams,
}: {
  entityType: "import" | "developer";
  entityId: string;
  teams: Team[];
}) {
  const action =
    entityType === "import"
      ? assignImportTeamManualAction
      : assignDeveloperTeamManualAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const idField = entityType === "import" ? "importId" : "developerId";

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name={idField} value={entityId} />
      <TeamSelect
        name="teamId"
        teams={teams}
        required
        includeEmpty={false}
        emptyLabel="Escolher time…"
        activeOnly
      />
      <button type="submit" disabled={pending} className="ui-btn-secondary">
        {pending ? "…" : "Atribuir"}
      </button>
      <FormFeedback error={state.error} success={state.success} />
    </form>
  );
}

export function SanitationPendingTable({
  title,
  rows,
  teams,
  entityType,
}: {
  title: string;
  rows: PendingReviewRow[];
  teams: Team[];
  entityType: "import" | "developer";
}) {
  return (
    <section className="space-y-4">
      <FormSectionHeader title={title} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma pendência.</p>
      ) : (
        <DataTable minWidthClassName="min-w-[640px]">
          <thead>
            <tr>
              <th>Registro</th>
              <th>Motivo</th>
              <th>Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td>
                  <p className="font-medium">{row.entity_label}</p>
                  <p className="text-xs text-muted-foreground break-all">
                    {row.entity_id}
                  </p>
                </td>
                <td className="text-muted-foreground">{row.reason}</td>
                <td>
                  <ManualAssignForm
                    entityType={entityType}
                    entityId={row.entity_id}
                    teams={teams}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}

export function SanitationHistoryTable({
  title,
  rows,
}: {
  title: string;
  rows: PendingReviewRow[];
}) {
  return (
    <section className="space-y-4">
      <FormSectionHeader title={title} />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum registro ainda.</p>
      ) : (
        <DataTable minWidthClassName="min-w-[640px]">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Registro</th>
              <th>Status</th>
              <th>Decisão</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.entity_type}</td>
                <td>{row.entity_label}</td>
                <td>{row.status}</td>
                <td className="text-muted-foreground">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </section>
  );
}
