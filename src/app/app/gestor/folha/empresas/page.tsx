import Link from "next/link";
import { InvoiceIssuerForm } from "@/components/folha/invoice-issuer-form";
import { PageHeader } from "@/components/page-header";
import { PageShell } from "@/components/page-shell";
import { DataTable, EmptyState } from "@/components/surface";
import { requirePermission } from "@/lib/auth/permissions";
import { listInvoiceIssuers } from "@/services/invoice-issuers";

export default async function GestorFolhaEmpresasPage() {
  await requirePermission("empresas", "access");
  const issuers = await listInvoiceIssuers();

  return (
    <PageShell size="lg">
      <PageHeader
        eyebrow="Folha"
        title="Empresas emissoras"
        description="Cadastro das empresas usadas na emissão de NF do fechamento financeiro."
        actions={
          <Link href="/app/gestor/folha" className="ui-btn-secondary">
            Voltar à Folha
          </Link>
        }
      />

      <InvoiceIssuerForm />

      <section className="ui-dashboard-panel space-y-3">
        <h2 className="text-base font-semibold">Empresas cadastradas</h2>
        {issuers.length === 0 ? (
          <EmptyState
            title="Nenhuma empresa"
            description="Cadastre a primeira empresa emissora acima."
          />
        ) : (
          <DataTable minWidthClassName="min-w-[720px]">
            <thead>
              <tr>
                <th>Razão social</th>
                <th>CNPJ</th>
                <th>Cidade/UF</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {issuers.map((issuer) => (
                <tr key={issuer.id}>
                  <td>
                    <p className="font-medium">{issuer.legal_name}</p>
                    {issuer.email ? (
                      <p className="text-xs text-muted-foreground">
                        {issuer.email}
                      </p>
                    ) : null}
                  </td>
                  <td className="tabular-nums">{issuer.cnpj}</td>
                  <td>
                    {[issuer.address_city, issuer.address_uf]
                      .filter(Boolean)
                      .join("/") || "—"}
                  </td>
                  <td>{issuer.is_active ? "Ativa" : "Inativa"}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </section>
    </PageShell>
  );
}
