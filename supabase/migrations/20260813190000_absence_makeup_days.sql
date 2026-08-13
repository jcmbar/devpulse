-- Absence makeup (compensação) days: offset absence discount on Fixo without Jira.

alter table public.monthly_closing_presence_days
  drop constraint if exists monthly_closing_presence_days_kind_check;

alter table public.monthly_closing_presence_days
  add constraint monthly_closing_presence_days_kind_check
  check (kind in ('travel', 'meal', 'absence', 'makeup'));

comment on table public.monthly_closing_presence_days is
  'Day selections for travel/meal/absence/makeup declared at monthly closing submit or draft.';

comment on column public.monthly_closings.absence_days_count is
  'Billed absence days after makeup offset: max(0, absences − makeups) when consider_jira_hours was false.';

comment on column public.monthly_closings.absence_amount is
  'Money discount: billed absence days × hours/day × hourly rate.';

alter table public.payroll_attendance_days
  drop constraint if exists payroll_attendance_days_day_kind_check;

alter table public.payroll_attendance_days
  add constraint payroll_attendance_days_day_kind_check
  check (day_kind in ('presencial', 'home', 'off', 'holiday', 'weekend', 'makeup'));
