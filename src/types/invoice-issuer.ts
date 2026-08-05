export type InvoiceIssuer = {
  id: string;
  legal_name: string;
  cnpj: string;
  state_registration: string | null;
  municipal_registration: string | null;
  address_street: string | null;
  address_neighborhood: string | null;
  address_cep: string | null;
  address_city: string | null;
  address_uf: string | null;
  email: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InvoiceIssuerWriteInput = {
  legalName: string;
  cnpj: string;
  stateRegistration?: string | null;
  municipalRegistration?: string | null;
  addressStreet?: string | null;
  addressNeighborhood?: string | null;
  addressCep?: string | null;
  addressCity?: string | null;
  addressUf?: string | null;
  email?: string | null;
  isActive?: boolean;
};
