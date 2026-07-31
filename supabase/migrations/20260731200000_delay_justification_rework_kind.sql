-- Allow separate justifications for delay and rework (one pending/accepted per kind).

alter table public.delay_justification_requests
  drop constraint if exists delay_justification_requests_kind_check;

alter table public.delay_justification_requests
  add constraint delay_justification_requests_kind_check
  check (kind in ('delay', 'rework'));

drop index if exists public.delay_justification_one_pending_idx;
drop index if exists public.delay_justification_one_accepted_idx;

create unique index if not exists delay_justification_one_pending_idx
  on public.delay_justification_requests (import_id, jira_key, developer_id, kind)
  where status = 'pending';

create unique index if not exists delay_justification_one_accepted_idx
  on public.delay_justification_requests (import_id, jira_key, developer_id, kind)
  where status = 'accepted';

comment on table public.delay_justification_requests is
  'Audit trail for delivery justifications (delay and/or rework): developer requests review; gestor accepts/rejects per kind. Accepted delays/reworks are excluded from net ranking penalties only.';
