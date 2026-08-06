-- Link monthly closing approval to a registered invoice issuer (empresa NF).
-- manager_invoice_notes becomes optional observation for the NF.

alter table public.monthly_closings
  add column if not exists invoice_issuer_id uuid
    references public.invoice_issuers (id) on delete set null;

create index if not exists monthly_closings_invoice_issuer_idx
  on public.monthly_closings (invoice_issuer_id);

comment on column public.monthly_closings.invoice_issuer_id is
  'Empresa para a qual o developer deve emitir a NF (aprovação do gestor).';
comment on column public.monthly_closings.manager_invoice_notes is
  'Observação opcional do gestor sobre a NF (além dos dados cadastrais da empresa).';

create or replace function public.prevent_finalized_monthly_closing_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'finalized' then
    if new.status is distinct from old.status
       and new.status in ('open', 'in_review', 'rejected', 'closed') then
      return new;
    end if;

    if (
      new.status is distinct from old.status
      or new.manager_invoice_notes is distinct from old.manager_invoice_notes
      or new.invoice_issuer_id is distinct from old.invoice_issuer_id
      or new.snapshot_generated_at is distinct from old.snapshot_generated_at
      or new.import_id is distinct from old.import_id
      or new.submitted_at is distinct from old.submitted_at
      or new.closed_at is distinct from old.closed_at
      or new.finalized_at is distinct from old.finalized_at
      or new.manager_approved_at is distinct from old.manager_approved_at
      or new.travel_presencial_days is distinct from old.travel_presencial_days
      or new.meal_presencial_days is distinct from old.meal_presencial_days
      or new.travel_amount is distinct from old.travel_amount
      or new.meal_amount is distinct from old.meal_amount
      or new.differential_amount is distinct from old.differential_amount
      or new.invoice_amount is distinct from old.invoice_amount
      or new.developer_values_notes is distinct from old.developer_values_notes
    ) then
      if new.jira_changed_after_finalized is not distinct from old.jira_changed_after_finalized
         and new.jira_changed_after_finalized_at is not distinct from old.jira_changed_after_finalized_at then
        raise exception 'Fechamento finalizado não pode ser alterado.';
      end if;

      if new.status is distinct from old.status
         or new.manager_invoice_notes is distinct from old.manager_invoice_notes
         or new.invoice_issuer_id is distinct from old.invoice_issuer_id
         or new.snapshot_generated_at is distinct from old.snapshot_generated_at
         or new.import_id is distinct from old.import_id
         or new.submitted_at is distinct from old.submitted_at
         or new.closed_at is distinct from old.closed_at
         or new.finalized_at is distinct from old.finalized_at
         or new.manager_approved_at is distinct from old.manager_approved_at
         or new.travel_presencial_days is distinct from old.travel_presencial_days
         or new.meal_presencial_days is distinct from old.meal_presencial_days
         or new.travel_amount is distinct from old.travel_amount
         or new.meal_amount is distinct from old.meal_amount
         or new.differential_amount is distinct from old.differential_amount
         or new.invoice_amount is distinct from old.invoice_amount
         or new.developer_values_notes is distinct from old.developer_values_notes then
        raise exception 'Fechamento finalizado não pode ser alterado.';
      end if;
    end if;
  end if;

  return new;
end;
$$;
