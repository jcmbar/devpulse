"use client";

import Link from "next/link";
import { Pencil, X } from "lucide-react";
import { useActionState, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  updateStgSessionMetaAction,
  type StgActionState,
} from "@/app/app/stg/actions";
import { DataTable } from "@/components/surface";
import { FormFeedback, FormField } from "@/components/ui/form";
import { formatDateBrazil } from "@/lib/datetime/format-brazil";
import { stgResultLabel, stgStatusLabel } from "@/lib/stg/ui";
import type { StgSession } from "@/types/stg";
import type { Team } from "@/types/team";

const initial: StgActionState = { error: null, success: null };

type StgSessionsTableProps = {
  sessions: StgSession[];
  teams: Team[];
  canEdit: boolean;
};

export function StgSessionsTable({
  sessions,
  teams,
  canEdit,
}: StgSessionsTableProps) {
  const [editing, setEditing] = useState<StgSession | null>(null);

  return (
    <>
      <DataTable minWidthClassName="min-w-[820px]" stickyFirstColumn>
        <thead>
          <tr>
            <th>Data</th>
            <th>Time</th>
            <th>Versão</th>
            <th>Ambiente</th>
            <th>Status</th>
            <th>Resultado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => {
            const team = teams.find((row) => row.id === session.team_id);
            return (
              <tr key={session.id}>
                <td className="whitespace-nowrap font-medium">
                  {formatDateBrazil(session.scheduled_on)}
                </td>
                <td>{team?.name ?? session.team_id.slice(0, 8)}</td>
                <td>{session.version_label}</td>
                <td className="text-muted-foreground">{session.environment}</td>
                <td>{stgStatusLabel(session.status)}</td>
                <td>
                  <span
                    className={
                      session.result === "approved"
                        ? "text-success"
                        : session.result === "blocked"
                          ? "font-medium text-danger"
                          : session.result === "waived"
                            ? "text-warning"
                            : "text-muted-foreground"
                    }
                  >
                    {stgResultLabel(session.result)}
                  </span>
                </td>
                <td className="text-right">
                  <div className="inline-flex flex-wrap items-center justify-end gap-1">
                    {canEdit ? (
                      <button
                        type="button"
                        className="ui-btn-ghost"
                        onClick={() => setEditing(session)}
                      >
                        <Pencil className="size-3.5" strokeWidth={1.9} />
                        Editar
                      </button>
                    ) : null}
                    <Link
                      href={`/app/stg/${session.id}`}
                      className="ui-btn-ghost"
                    >
                      Abrir
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>

      {editing ? (
        <EditSessionMetaModal
          session={editing}
          teams={teams}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

function EditSessionMetaModal({
  session,
  teams,
  onClose,
}: {
  session: StgSession;
  teams: Team[];
  onClose: () => void;
}) {
  const router = useRouter();
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (prev: StgActionState, formData: FormData) => {
      const result = await updateStgSessionMetaAction(prev, formData);
      if (result.success) {
        onClose();
        router.refresh();
      }
      return result;
    },
    initial,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[min(90dvh,100%)] w-full min-w-0 max-w-lg flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-t-[var(--radius)] border border-border bg-[var(--surface-elevated)] p-4 shadow-[var(--shadow-md)] sm:rounded-[var(--radius)] sm:p-5"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              Editar sessão
            </p>
            <h2
              id={titleId}
              className="truncate text-base font-semibold tracking-tight"
            >
              Data, time e versão
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="size-4" strokeWidth={1.9} />
          </button>
        </div>

        <form action={formAction} className="space-y-3">
          <input type="hidden" name="sessionId" value={session.id} />
          <FormField label="Data" htmlFor={`${titleId}-date`}>
            <input
              id={`${titleId}-date`}
              type="date"
              name="scheduledOn"
              required
              defaultValue={session.scheduled_on}
              className="ui-input"
            />
          </FormField>
          <FormField label="Time" htmlFor={`${titleId}-team`}>
            <select
              id={`${titleId}-team`}
              name="teamId"
              required
              defaultValue={session.team_id}
              className="ui-input"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Versão" htmlFor={`${titleId}-version`}>
            <input
              id={`${titleId}-version`}
              name="versionLabel"
              required
              defaultValue={session.version_label}
              className="ui-input"
            />
          </FormField>
          <FormField label="Ambiente" htmlFor={`${titleId}-env`}>
            <input
              id={`${titleId}-env`}
              name="environment"
              defaultValue={session.environment}
              className="ui-input"
              placeholder="staging"
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Trocar o time não recalcula o catálogo já snapshotado nesta sessão.
            Data + time + versão precisam ser únicos.
          </p>
          <FormFeedback error={state.error} success={state.success} />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="ui-btn-secondary w-full sm:w-auto"
              disabled={pending}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="ui-btn-primary w-full sm:w-auto"
              disabled={pending}
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
