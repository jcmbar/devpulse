-- Harden lock: finalized monthly closings cannot change operational fields / status.

create or replace function public.prevent_finalized_monthly_closing_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and old.status = 'finalized'
     and (
       new.status is distinct from old.status
       or new.manager_invoice_notes is distinct from old.manager_invoice_notes
       or new.snapshot_generated_at is distinct from old.snapshot_generated_at
       or new.import_id is distinct from old.import_id
       or new.submitted_at is distinct from old.submitted_at
       or new.closed_at is distinct from old.closed_at
       or new.finalized_at is distinct from old.finalized_at
       or new.manager_approved_at is distinct from old.manager_approved_at
     ) then
    -- Allow only jira drift flags after finalized.
    if new.jira_changed_after_finalized is not distinct from old.jira_changed_after_finalized
       and new.jira_changed_after_finalized_at is not distinct from old.jira_changed_after_finalized_at then
      raise exception 'Fechamento finalizado não pode ser alterado.';
    end if;

    if new.status is distinct from old.status
       or new.manager_invoice_notes is distinct from old.manager_invoice_notes
       or new.snapshot_generated_at is distinct from old.snapshot_generated_at
       or new.import_id is distinct from old.import_id
       or new.submitted_at is distinct from old.submitted_at
       or new.closed_at is distinct from old.closed_at
       or new.finalized_at is distinct from old.finalized_at
       or new.manager_approved_at is distinct from old.manager_approved_at then
      raise exception 'Fechamento finalizado não pode ser alterado.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists monthly_closings_prevent_finalized_mutation
  on public.monthly_closings;

create trigger monthly_closings_prevent_finalized_mutation
before update on public.monthly_closings
for each row
execute function public.prevent_finalized_monthly_closing_mutation();

create or replace function public.prevent_finalized_monthly_closing_item_mutation()
returns trigger
language plpgsql
as $$
declare
  closing_status text;
begin
  select status into closing_status
  from public.monthly_closings
  where id = coalesce(new.monthly_closing_id, old.monthly_closing_id);

  if closing_status = 'finalized' then
    raise exception 'Itens de fechamento finalizado não podem ser alterados.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists monthly_closing_items_prevent_finalized_mutation
  on public.monthly_closing_items;

create trigger monthly_closing_items_prevent_finalized_mutation
before insert or update or delete on public.monthly_closing_items
for each row
execute function public.prevent_finalized_monthly_closing_item_mutation();

create or replace function public.prevent_finalized_monthly_closing_attachment_mutation()
returns trigger
language plpgsql
as $$
declare
  closing_status text;
begin
  select status into closing_status
  from public.monthly_closings
  where id = coalesce(new.monthly_closing_id, old.monthly_closing_id);

  if closing_status = 'finalized' then
    -- Allow manager validation flag updates only before finalize; after finalize lock hard.
    raise exception 'Anexos de fechamento finalizado não podem ser alterados.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists monthly_closing_attachments_prevent_finalized_mutation
  on public.monthly_closing_attachments;

create trigger monthly_closing_attachments_prevent_finalized_mutation
before insert or update or delete on public.monthly_closing_attachments
for each row
execute function public.prevent_finalized_monthly_closing_attachment_mutation();
