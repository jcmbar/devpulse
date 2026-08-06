import { formatInvoiceIssuerDetails } from "@/lib/metrics/invoice-issuer-format";
import type { InvoiceIssuer } from "@/types/invoice-issuer";

type InvoiceIssuerDetailsCardProps = {
  issuer: InvoiceIssuer;
  /** Optional gestor observation shown below company data. */
  observation?: string | null;
  title?: string;
};

export function InvoiceIssuerDetailsCard({
  issuer,
  observation,
  title = "Emitir nota fiscal para",
}: InvoiceIssuerDetailsCardProps) {
  const observationTrimmed = observation?.trim() || null;

  return (
    <div className="space-y-3 rounded-[var(--radius-sm)] border border-border bg-muted/20 px-3 py-3">
      <div>
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {title}
        </p>
        <p className="mt-1.5 text-sm text-pretty whitespace-pre-wrap">
          {formatInvoiceIssuerDetails(issuer)}
        </p>
      </div>
      {observationTrimmed ? (
        <div className="border-t border-border/70 pt-2.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Observação para a NF
          </p>
          <p className="mt-1 text-sm text-pretty whitespace-pre-wrap">
            {observationTrimmed}
          </p>
        </div>
      ) : null}
    </div>
  );
}
