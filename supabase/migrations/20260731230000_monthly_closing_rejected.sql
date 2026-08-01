-- Add rejected status + rejection/resubmission audit fields for monthly closings.

alter table public.monthly_closings
  drop constraint if exists monthly_closings_status_check;

alter table public.monthly_closings
  add constraint monthly_closings_status_check
  check (status in ('open', 'in_review', 'rejected', 'closed', 'finalized'));

alter table public.monthly_closings
  add column if not exists manager_rejection_notes text,
  add column if not exists manager_rejected_at timestamptz,
  add column if not exists manager_rejected_by_user_id uuid
    references public.profiles (id) on delete set null,
  add column if not exists developer_resubmission_notes text,
  add column if not exists resubmitted_at timestamptz,
  add column if not exists resubmitted_by_user_id uuid
    references public.profiles (id) on delete set null;

comment on column public.monthly_closings.manager_rejection_notes is
  'Free-text inconsistency notes from gestor when rejecting a closing back to the developer.';
comment on column public.monthly_closings.developer_resubmission_notes is
  'Developer response/justification when resubmitting after rejection.';

-- Allow developers to update own closings while rejected (reply + resubmit).
drop policy if exists monthly_closings_update_own_open on public.monthly_closings;

create policy "monthly_closings_update_own_open"
  on public.monthly_closings
  for update
  to authenticated
  using (
    developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
    and status in ('open', 'rejected', 'closed')
  )
  with check (
    developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
  );

-- Snapshot items may be regenerated while rejected (same as open path before submit).
drop policy if exists monthly_closing_items_insert_own_open on public.monthly_closing_items;

create policy "monthly_closing_items_insert_own_open"
  on public.monthly_closing_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.status in ('open', 'rejected')
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  );

create policy "monthly_closing_items_delete_own_open_or_rejected"
  on public.monthly_closing_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.monthly_closings c
      where c.id = monthly_closing_id
        and c.status in ('open', 'rejected')
        and c.developer_id in (
          select d.id from public.developers d where d.profile_id = auth.uid()
        )
    )
  );
