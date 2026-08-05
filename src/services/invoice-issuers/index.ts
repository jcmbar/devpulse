import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  InvoiceIssuer,
  InvoiceIssuerWriteInput,
} from "@/types/invoice-issuer";

function mapIssuer(row: Record<string, unknown>): InvoiceIssuer {
  return {
    id: String(row.id),
    legal_name: String(row.legal_name),
    cnpj: String(row.cnpj),
    state_registration: (row.state_registration as string | null) ?? null,
    municipal_registration:
      (row.municipal_registration as string | null) ?? null,
    address_street: (row.address_street as string | null) ?? null,
    address_neighborhood: (row.address_neighborhood as string | null) ?? null,
    address_cep: (row.address_cep as string | null) ?? null,
    address_city: (row.address_city as string | null) ?? null,
    address_uf: (row.address_uf as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    is_active: Boolean(row.is_active),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listInvoiceIssuers(input?: {
  activeOnly?: boolean;
}): Promise<InvoiceIssuer[]> {
  const supabase = await createClient();
  let query = supabase
    .from("invoice_issuers")
    .select("*")
    .order("legal_name", { ascending: true });

  if (input?.activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao listar empresas emissoras: ${error.message}`);
  }
  return (data ?? []).map((row) => mapIssuer(row as Record<string, unknown>));
}

export async function getInvoiceIssuer(
  id: string,
): Promise<InvoiceIssuer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoice_issuers")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Falha ao carregar empresa emissora: ${error.message}`);
  }
  return data ? mapIssuer(data as Record<string, unknown>) : null;
}

export async function upsertInvoiceIssuer(
  input: InvoiceIssuerWriteInput & { id?: string },
): Promise<InvoiceIssuer> {
  const supabase = await createClient();
  const payload = {
    legal_name: input.legalName.trim(),
    cnpj: input.cnpj.trim(),
    state_registration: input.stateRegistration?.trim() || null,
    municipal_registration: input.municipalRegistration?.trim() || null,
    address_street: input.addressStreet?.trim() || null,
    address_neighborhood: input.addressNeighborhood?.trim() || null,
    address_cep: input.addressCep?.trim() || null,
    address_city: input.addressCity?.trim() || null,
    address_uf: input.addressUf?.trim().toUpperCase() || null,
    email: input.email?.trim() || null,
    is_active: input.isActive ?? true,
  };

  if (!payload.legal_name) {
    throw new Error("Informe a razão social.");
  }
  if (!payload.cnpj) {
    throw new Error("Informe o CNPJ.");
  }

  if (input.id) {
    const { data, error } = await supabase
      .from("invoice_issuers")
      .update(payload)
      .eq("id", input.id)
      .select("*")
      .single();
    if (error) {
      throw new Error(`Falha ao atualizar empresa: ${error.message}`);
    }
    return mapIssuer(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("invoice_issuers")
    .insert(payload)
    .select("*")
    .single();
  if (error) {
    throw new Error(`Falha ao criar empresa: ${error.message}`);
  }
  return mapIssuer(data as Record<string, unknown>);
}
