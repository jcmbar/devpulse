-- FASE 3A.2 — compatibilidade temporária de escrita antes do hardening 3B
-- Enquanto hours_delta e note ainda existirem no schema remoto, as escritas
-- do ledger precisam preencher essas colunas legadas.

create or replace function public.finalize_monthly_closing_with_time_bank(
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
  v_next_sequence integer;
  v_signed_minutes integer;
  v_minutes_amount integer;
  v_entry_type text;
  v_description text;
  v_time_bank_posted boolean := false;
  v_time_bank_entry_id uuid := null;
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

  if v_closing.status = 'finalized' then
    return v_closing;
  end if;

  if v_closing.status <> 'closed' then
    raise exception 'closing must be closed before finalize';
  end if;

  if v_closing.time_bank_enabled_snapshot = true
     and v_closing.time_bank_hours_delta is not null
     and v_closing.time_bank_hours_delta <> 0
     and v_closing.time_bank_posted_at is null then

    v_signed_minutes := pg_catalog.round(v_closing.time_bank_hours_delta * 60.0)::integer;
    v_minutes_amount := pg_catalog.abs(v_signed_minutes);
    v_entry_type := case when v_signed_minutes > 0 then 'credit' else 'debit' end;
    v_next_sequence := pg_catalog.coalesce(v_closing.time_bank_posting_sequence, 0) + 1;
    v_description := pg_catalog.format(
      'Fechamento de %s — %sh apuradas vs. %sh previstas.',
      v_closing.year_month,
      pg_catalog.coalesce(v_closing.worked_hours_snapshot::text, '0'),
      pg_catalog.coalesce(v_closing.contracted_hours_month_snapshot::text, '0')
    );

    insert into public.developer_time_bank_entries (
      developer_id,
      year_month,
      hours_delta,
      monthly_closing_id,
      note,
      entry_date,
      entry_type,
      source,
      minutes_amount,
      closing_sequence,
      description,
      created_by,
      metadata_json
    )
    values (
      v_closing.developer_id,
      v_closing.year_month,
      v_closing.time_bank_hours_delta,
      v_closing.id,
      v_description,
      (v_now at time zone 'America/Sao_Paulo')::date,
      v_entry_type,
      'monthly_closing',
      v_minutes_amount,
      v_next_sequence,
      v_description,
      v_actor_user_id,
      pg_catalog.jsonb_build_object(
        'worked_hours_snapshot', v_closing.worked_hours_snapshot,
        'contracted_hours_month_snapshot', v_closing.contracted_hours_month_snapshot,
        'time_bank_hours_delta', v_closing.time_bank_hours_delta
      )
    )
    returning id into v_time_bank_entry_id;

    v_event_closing_sequence := v_next_sequence;

    update public.monthly_closings
    set status = 'finalized',
        finalized_at = v_now,
        finalized_by_user_id = v_actor_user_id,
        time_bank_posted_at = v_now,
        time_bank_posting_sequence = v_next_sequence
    where id = v_closing.id
    returning * into v_closing;

    v_time_bank_posted := true;
  else
    update public.monthly_closings
    set status = 'finalized',
        finalized_at = v_now,
        finalized_by_user_id = v_actor_user_id
    where id = v_closing.id
    returning * into v_closing;
  end if;

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
    'finalized',
    'closed',
    'finalized',
    v_actor_user_id,
    pg_catalog.jsonb_build_object(
      'invoiceValidated', true,
      'boletoValidated', true,
      'timeBankPosted', v_time_bank_posted,
      'timeBankHoursDelta', v_closing.time_bank_hours_delta,
      'timeBankPostingSequence', v_event_closing_sequence,
      'closingSequence', v_event_closing_sequence,
      'timeBankEntryId', v_time_bank_entry_id,
      'timeBankReversalEntryId', null
    )
  );

  return v_closing;
end;
$$;

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
  v_reversal_description text;
  v_legacy_hours_delta numeric(10, 2);
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
    v_reversal_description := pg_catalog.format(
      'Reversão do fechamento %s reaberto pelo gestor.',
      v_entry.year_month
    );
    v_legacy_hours_delta := pg_catalog.round(
      (
        case
          when v_entry.entry_type = 'credit' then -v_entry.minutes_amount
          else v_entry.minutes_amount
        end
      )::numeric / 60.0,
      2
    );

    insert into public.developer_time_bank_entries (
      developer_id,
      year_month,
      hours_delta,
      monthly_closing_id,
      note,
      entry_date,
      entry_type,
      source,
      minutes_amount,
      closing_sequence,
      description,
      created_by,
      reversed_entry_id,
      metadata_json
    )
    values (
      v_entry.developer_id,
      v_entry.year_month,
      v_legacy_hours_delta,
      v_entry.monthly_closing_id,
      v_reversal_description,
      (v_now at time zone 'America/Sao_Paulo')::date,
      v_reversal_type,
      'reversal',
      v_entry.minutes_amount,
      v_entry.closing_sequence,
      v_reversal_description,
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
