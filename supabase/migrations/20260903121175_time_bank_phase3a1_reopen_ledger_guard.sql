-- FASE 3A.1 — hardening preventivo da reabertura
-- Bloqueia reabertura quando os metadados de posting apontam para um lançamento
-- de banco de horas que não existe mais no ledger.

create or replace function public.reopen_monthly_closing_with_time_bank(
  p_closing_id uuid
)
returns public.monthly_closings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_actor_user_id uuid := auth.uid();
  v_closing public.monthly_closings%rowtype;
  v_entry public.developer_time_bank_entries%rowtype;
  v_reversal_type text;
  v_time_bank_reversed boolean := false;
  v_time_bank_reversal_entry_id uuid := null;
  v_event_closing_sequence integer := null;
begin
  if v_actor_user_id is null or not public.is_admin_or_gestor() then
    raise exception 'not authorized';
  end if;

  select *
  into v_closing
  from public.monthly_closings
  where id = p_closing_id
  for update;

  if not found then
    raise exception 'closing not found';
  end if;

  if v_closing.status = 'closed' and v_closing.time_bank_posted_at is null then
    return v_closing;
  end if;

  if v_closing.status <> 'finalized' then
    raise exception 'only finalized closings can be reopened by this rpc';
  end if;

  if v_closing.time_bank_posted_at is not null
     and pg_catalog.coalesce(v_closing.time_bank_posting_sequence, 0) > 0 then
    select *
    into v_entry
    from public.developer_time_bank_entries
    where monthly_closing_id = v_closing.id
      and source = 'monthly_closing'
      and closing_sequence = v_closing.time_bank_posting_sequence
    limit 1;

    if not found then
      raise exception
        'time bank ledger drift detected for closing % sequence %',
        v_closing.id,
        v_closing.time_bank_posting_sequence;
    end if;

    v_event_closing_sequence := v_entry.closing_sequence;

    perform 1
    from public.developer_time_bank_entries
    where reversed_entry_id = v_entry.id;

    if found then
      raise exception
        'time bank ledger drift detected: reversal already exists for finalized closing % (entry %)',
        v_closing.id,
        v_entry.id;
    end if;

    v_reversal_type := case when v_entry.entry_type = 'credit' then 'debit' else 'credit' end;

    insert into public.developer_time_bank_entries (
      developer_id,
      year_month,
      entry_date,
      entry_type,
      source,
      minutes_amount,
      monthly_closing_id,
      closing_sequence,
      description,
      created_by,
      reversed_entry_id,
      metadata_json
    )
    values (
      v_entry.developer_id,
      v_entry.year_month,
      (v_now at time zone 'America/Sao_Paulo')::date,
      v_reversal_type,
      'reversal',
      v_entry.minutes_amount,
      v_entry.monthly_closing_id,
      v_entry.closing_sequence,
      pg_catalog.format('Reversão do fechamento %s reaberto pelo gestor.', v_entry.year_month),
      v_actor_user_id,
      v_entry.id,
      pg_catalog.jsonb_build_object(
        'reversed_source', v_entry.source,
        'reversed_entry_type', v_entry.entry_type,
        'reversed_closing_sequence', v_entry.closing_sequence
      )
    )
    returning id into v_time_bank_reversal_entry_id;

    v_time_bank_reversed := true;
  end if;

  update public.monthly_closings
  set status = 'closed',
      finalized_at = null,
      finalized_by_user_id = null,
      time_bank_posted_at = null
  where id = v_closing.id
  returning * into v_closing;

  insert into public.monthly_closing_events (
    monthly_closing_id,
    event_type,
    from_status,
    to_status,
    actor_user_id,
    payload_json
  )
  values (
    v_closing.id,
    'status_reverted',
    'finalized',
    'closed',
    v_actor_user_id,
    pg_catalog.jsonb_build_object(
      'action', 'reopen_finalized',
      'timeBankReversed', v_time_bank_reversed,
      'timeBankPostingSequence', v_event_closing_sequence,
      'closingSequence', v_event_closing_sequence,
      'timeBankEntryId', null,
      'timeBankReversalEntryId', v_time_bank_reversal_entry_id
    )
  );

  return v_closing;
end;
$$;
