"use client";

import { FormActions, FormFeedback, FormField } from "@/components/ui/form";
import { useActionState } from "react";
import {
  importSpreadsheetAction,
  type ImportActionState,
} from "@/app/app/imports/actions";

const initialState: ImportActionState = {
  ok: false,
  error: null,
  importId: null,
  insertedCount: null,
  skippedRows: null,
  developersLinked: null,
  snapshotsCreated: null,
  deliveryMin: null,
  deliveryMax: null,
  rowsWithDelivery: null,
  warnings: [],
  sheetName: null,
  teamName: null,
  jiraKeyPrefix: null,
  archivedOlderCount: null,
};

export function ImportForm() {
  const [state, formAction, isPending] = useActionState(
    importSpreadsheetAction,
    initialState,
  );

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-5">
        <FormField
          label="Arquivo da planilha (arquivo completo)"
          htmlFor="file"
          hint={
            <>
              O time é detectado pelo prefixo das chaves Jira (ex.: AP-123).
              Arquivos com prefixos misturados são rejeitados. Prefixo
              desconhecido: cadastre o time em{" "}
              <span className="font-medium text-foreground">/app/teams</span>{" "}
              antes.
            </>
          }
        >
          <input
            id="file"
            name="file"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            required
            className="ui-file"
          />
        </FormField>

        <FormActions
          primary={{
            label: "Importar planilha completa",
            loadingLabel: "Importando...",
            pending: isPending,
          }}
        />
      </form>

      <FormFeedback error={state.error} />

      {state.ok ? (
        <div className="ui-panel">
          <p className="font-medium">Importação concluída</p>
          <p>
            <span className="text-muted-foreground">Time:</span> {state.teamName}{" "}
            ({state.jiraKeyPrefix}-…)
          </p>
          <p>
            <span className="text-muted-foreground">Faixa de entregas:</span>{" "}
            {state.deliveryMin} → {state.deliveryMax}
          </p>
          <p>
            <span className="text-muted-foreground">Cards totais:</span>{" "}
            {state.insertedCount}
          </p>
          <p>
            <span className="text-muted-foreground">
              Cards com entrega válida:
            </span>{" "}
            {state.rowsWithDelivery}
          </p>
          <p>
            <span className="text-muted-foreground">Linhas ignoradas:</span>{" "}
            {state.skippedRows}
          </p>
          <p>
            <span className="text-muted-foreground">
              Developers vinculados/criados:
            </span>{" "}
            {state.developersLinked}
          </p>
          <p>
            <span className="text-muted-foreground">Snapshots gerados:</span>{" "}
            {state.snapshotsCreated}
          </p>
          {state.archivedOlderCount != null && state.archivedOlderCount > 0 ? (
            <p>
              <span className="text-muted-foreground">Arquivados neste time:</span>{" "}
              {state.archivedOlderCount} (mantemos 2 ativos)
            </p>
          ) : null}
          {state.sheetName ? (
            <p>
              <span className="text-muted-foreground">Aba lida:</span>{" "}
              {state.sheetName}
            </p>
          ) : null}
          {state.importId ? (
            <p className="break-all text-xs text-muted-foreground">
              Import ID: {state.importId}
            </p>
          ) : null}
          {state.warnings.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {state.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
