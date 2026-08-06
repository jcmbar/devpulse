import type { InvoiceIssuer } from "@/types/invoice-issuer";

/** Human-readable block of issuer data for NF orientation (developer + gestor). */
export function formatInvoiceIssuerDetails(issuer: InvoiceIssuer): string {
  const lines: string[] = [issuer.legal_name, `CNPJ: ${issuer.cnpj}`];

  if (issuer.state_registration?.trim()) {
    lines.push(`Inscrição Estadual: ${issuer.state_registration.trim()}`);
  }
  if (issuer.municipal_registration?.trim()) {
    lines.push(`Inscrição Municipal: ${issuer.municipal_registration.trim()}`);
  }

  const addressParts = [
    issuer.address_street?.trim(),
    issuer.address_neighborhood
      ? `Bairro: ${issuer.address_neighborhood.trim()}`
      : null,
    issuer.address_cep ? `CEP: ${issuer.address_cep.trim()}` : null,
    [issuer.address_city?.trim(), issuer.address_uf?.trim()]
      .filter(Boolean)
      .join("/"),
  ].filter(Boolean);

  if (addressParts.length > 0) {
    lines.push(addressParts.join(", "));
  }

  if (issuer.email?.trim()) {
    lines.push(`E-mail: ${issuer.email.trim()}`);
  }

  return lines.join("\n");
}
