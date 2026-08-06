-- Allow managers to reopen a finalized monthly closing (status → non-finalized).
-- Operational edits while status remains 'finalized' stay blocked.
-- Item/attachment locks still apply while status is finalized; reopen first, then mutate.

create or replace function public.prevent_finalized_monthly_closing_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'finalized' then
    -- Explicit reopen / status rollback away from finalized.
    if new.status is distinct from old.status
       and new.status in ('open', 'in_review', 'rejected', 'closed') then
      return new;
    end if;

    if (
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
  end if;

  return new;
end;
$$;
