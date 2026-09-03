-- FASE 2 — RPCs transacionais, idempotência complementar, RLS e append-only

do $$
declare
  v_duplicate_count bigint;
begin
  select count(*)
  into v_duplicate_count
  from public.time_bank_phase2_duplicate_monthly_closing_sequences;

  if v_duplicate_count > 0 then
    raise exception
      'Fase 2 bloqueada: % duplicidade(s) de monthly_closing_id + closing_sequence ainda existem.',
      v_duplicate_count;
  end if;
end;
$$;

create unique index if not exists developer_time_bank_entries_monthly_closing_sequence_unique
  on public.developer_time_bank_entries (monthly_closing_id, closing_sequence)
  where source = 'monthly_closing'
    and monthly_closing_id is not null
    and closing_sequence is not null;

create unique index if not exists developer_time_bank_entries_reversed_entry_unique
  on public.developer_time_bank_entries (reversed_entry_id)
  where reversed_entry_id is not null;

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
      metadata_json
    )
    values (
      v_closing.developer_id,
      v_closing.year_month,
      (v_now at time zone 'America/Sao_Paulo')::date,
      v_entry_type,
      'monthly_closing',
      v_minutes_amount,
      v_closing.id,
      v_next_sequence,
      pg_catalog.format(
        'Fechamento de %s — %sh apuradas vs. %sh previstas.',
        v_closing.year_month,
        pg_catalog.coalesce(v_closing.worked_hours_snapshot::text, '0'),
        pg_catalog.coalesce(v_closing.contracted_hours_month_snapshot::text, '0')
      ),
      v_actor_user_id,
      pg_catalog.jsonb_build_object(
        'worked_hours_snapshot', v_closing.worked_hours_snapshot,
        'contracted_hours_month_snapshot', v_closing.contracted_hours_month_snapshot,
        'time_bank_hours_delta', v_closing.time_bank_hours_delta
      )
    );

    update public.monthly_closings
    set status = 'finalized',
        finalized_at = v_now,
        finalized_by_user_id = v_actor_user_id,
        time_bank_posted_at = v_now,
        time_bank_posting_sequence = v_next_sequence
    where id = v_closing.id
    returning * into v_closing;

    return v_closing;
  end if;

  update public.monthly_closings
  set status = 'finalized',
      finalized_at = v_now,
      finalized_by_user_id = v_actor_user_id
  where id = v_closing.id
  returning * into v_closing;

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

    if found then
      perform 1
      from public.developer_time_bank_entries
      where reversed_entry_id = v_entry.id;

      if not found then
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
        );
      end if;
    end if;
  end if;

  update public.monthly_closings
  set status = 'closed',
      finalized_at = null,
      finalized_by_user_id = null,
      time_bank_posted_at = null
  where id = v_closing.id
  returning * into v_closing;

  return v_closing;
end;
$$;

revoke all on function public.finalize_monthly_closing_with_time_bank(uuid) from public;
revoke all on function public.finalize_monthly_closing_with_time_bank(uuid) from anon;
grant execute on function public.finalize_monthly_closing_with_time_bank(uuid) to authenticated;

revoke all on function public.reopen_monthly_closing_with_time_bank(uuid) from public;
revoke all on function public.reopen_monthly_closing_with_time_bank(uuid) from anon;
grant execute on function public.reopen_monthly_closing_with_time_bank(uuid) to authenticated;

drop policy if exists "developer_time_bank_entries_write_managers"
  on public.developer_time_bank_entries;
drop policy if exists "developer_time_bank_entries_select_own_or_managers"
  on public.developer_time_bank_entries;
drop policy if exists "developer_time_bank_entries_insert_managers"
  on public.developer_time_bank_entries;
drop policy if exists "developer_time_bank_entries_insert_manual_adjustment_managers"
  on public.developer_time_bank_entries;

create policy "developer_time_bank_entries_select_own_or_managers"
  on public.developer_time_bank_entries
  for select
  to authenticated
  using (
    public.is_admin_or_gestor()
    or developer_id in (
      select d.id
      from public.developers d
      where d.profile_id = auth.uid()
    )
  );

create policy "developer_time_bank_entries_insert_manual_adjustment_managers"
  on public.developer_time_bank_entries
  for insert
  to authenticated
  with check (
    public.is_admin_or_gestor()
    and source = 'manual_adjustment'
    and monthly_closing_id is null
    and reversed_entry_id is null
    and minutes_amount is not null
    and minutes_amount > 0
    and entry_type in ('credit', 'debit')
  );

create or replace function public.prevent_time_bank_entry_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Banco de horas é append-only. Use um lançamento de reversão.';
end;
$$;

drop trigger if exists developer_time_bank_entries_block_mutation
  on public.developer_time_bank_entries;

create trigger developer_time_bank_entries_block_mutation
before update or delete on public.developer_time_bank_entries
for each row
execute function public.prevent_time_bank_entry_mutation();
