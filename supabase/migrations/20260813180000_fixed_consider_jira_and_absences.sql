-- Fixed compensation: optional Jira hours enforcement + absence days on closing.

alter table public.developer_compensation
  add column if not exists consider_jira_hours boolean not null default true;

comment on column public.developer_compensation.consider_jira_hours is
  'Fixo only: when true, NF uses Jira deficit/time bank; when false, uses absence days × h/day × rate (ignores Jira). Variable always uses Jira.';

alter table public.monthly_closings
  add column if not exists consider_jira_hours_snapshot boolean,
  add column if not exists absence_days_count integer,
  add column if not exists absence_amount numeric(12, 2);

comment on column public.monthly_closings.consider_jira_hours_snapshot is
  'Frozen at submit/draft: whether this closing applied Jira hours to the NF.';
comment on column public.monthly_closings.absence_days_count is
  'Count of absence days declared when consider_jira_hours was false.';
comment on column public.monthly_closings.absence_amount is
  'Money discount: absence_days × hours/day × hourly rate.';

-- Widen presence kind check to include absence.
alter table public.monthly_closing_presence_days
  drop constraint if exists monthly_closing_presence_days_kind_check;

alter table public.monthly_closing_presence_days
  add constraint monthly_closing_presence_days_kind_check
  check (kind in ('travel', 'meal', 'absence'));

comment on table public.monthly_closing_presence_days is
  'Day selections for travel/meal/absence declared at monthly closing submit or draft.';
