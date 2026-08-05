"use client";

import {
  upsertInvoiceIssuerAction,
  type PayrollFormState,
} from "@/app/app/gestor/folha/actions";
import {
  FormActions,
  FormFeedback,
  FormField,
} from "@/components/ui/form";
import type { InvoiceIssuer } from "@/types/invoice-issuer";
import { useActionState } from "react";

const initialState: PayrollFormState = {
  error: null,
  success: null,
};

export function InvoiceIssuerForm({
  issuer,
}: {
  issuer?: InvoiceIssuer | null;
}) {
  const [state, formAction, isPending] = useActionState(
    upsertInvoiceIssuerAction,
    initialState,
  );

  return (
    <form action={formAction} className="ui-dashboard-panel space-y-4">
      {issuer ? <input type="hidden" name="id" value={issuer.id} /> : null}
      <h2 className="text-base font-semibold">
        {issuer ? "Editar empresa" : "Nova empresa emissora"}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Razão social" htmlFor="legalName">
          <input
            id="legalName"
            name="legalName"
            required
            defaultValue={issuer?.legal_name ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField label="CNPJ" htmlFor="cnpj">
          <input
            id="cnpj"
            name="cnpj"
            required
            defaultValue={issuer?.cnpj ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField label="Inscrição estadual" htmlFor="stateRegistration">
          <input
            id="stateRegistration"
            name="stateRegistration"
            defaultValue={issuer?.state_registration ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField label="Inscrição municipal" htmlFor="municipalRegistration">
          <input
            id="municipalRegistration"
            name="municipalRegistration"
            defaultValue={issuer?.municipal_registration ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField
          label="Endereço"
          htmlFor="addressStreet"
          className="sm:col-span-2"
        >
          <input
            id="addressStreet"
            name="addressStreet"
            defaultValue={issuer?.address_street ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField label="Bairro" htmlFor="addressNeighborhood">
          <input
            id="addressNeighborhood"
            name="addressNeighborhood"
            defaultValue={issuer?.address_neighborhood ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField label="CEP" htmlFor="addressCep">
          <input
            id="addressCep"
            name="addressCep"
            defaultValue={issuer?.address_cep ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField label="Cidade" htmlFor="addressCity">
          <input
            id="addressCity"
            name="addressCity"
            defaultValue={issuer?.address_city ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField label="UF" htmlFor="addressUf">
          <input
            id="addressUf"
            name="addressUf"
            maxLength={2}
            defaultValue={issuer?.address_uf ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField label="E-mail" htmlFor="email">
          <input
            id="email"
            name="email"
            type="email"
            defaultValue={issuer?.email ?? ""}
            className="ui-input"
          />
        </FormField>
        <FormField label="Ativa" htmlFor="isActive">
          <select
            id="isActive"
            name="isActive"
            className="ui-select"
            defaultValue={issuer?.is_active === false ? "false" : "true"}
          >
            <option value="true">Sim</option>
            <option value="false">Não</option>
          </select>
        </FormField>
      </div>
      <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:items-end">
        <FormFeedback error={state.error} success={state.success} />
        <FormActions
          primary={{
            label: issuer ? "Salvar empresa" : "Criar empresa",
            loadingLabel: "Salvando...",
            pending: isPending,
          }}
        />
      </div>
    </form>
  );
}
