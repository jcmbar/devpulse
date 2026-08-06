"use client";

import {
  buildSinteticoFileName,
  buildSinteticoXlsxBytes,
  type SinteticoExportRow,
} from "@/lib/folha/build-sintetico-xlsx";
import { useState } from "react";

export function PayrollSinteticoExportButton({
  yearMonth,
  periodStart,
  periodEnd,
  rows,
}: {
  yearMonth: string;
  periodStart: string;
  periodEnd: string;
  rows: SinteticoExportRow[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const reviewedCount = rows.length;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="ui-btn-primary text-sm"
        disabled={pending || reviewedCount === 0}
        title={
          reviewedCount === 0
            ? "Marque ao menos uma pessoa como conferida para gerar o sintético."
            : `Gera a planilha do financeiro com ${reviewedCount} pessoa(s) conferida(s).`
        }
        onClick={() => {
          setError(null);
          setPending(true);
          try {
            const bytes = buildSinteticoXlsxBytes({
              yearMonth,
              periodStart,
              periodEnd,
              rows,
            });
            const blob = new Blob([Uint8Array.from(bytes)], {
              type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = buildSinteticoFileName(yearMonth);
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            URL.revokeObjectURL(url);
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Não foi possível gerar o sintético.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Gerando..." : "Gerar Sintético"}
      </button>
      {reviewedCount === 0 ? (
        <span className="text-xs text-muted-foreground">
          Nenhum conferido neste mês
        </span>
      ) : (
        <span className="text-xs text-muted-foreground tabular-nums">
          {reviewedCount} conferido{reviewedCount === 1 ? "" : "s"}
        </span>
      )}
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
