-- Mark Folha line as reviewed (gestor already checked adjustments for person/month).

alter table public.payroll_closing_items
  add column if not exists is_reviewed boolean not null default false;

alter table public.payroll_closing_items
  add column if not exists reviewed_at timestamptz;

alter table public.payroll_closing_items
  add column if not exists reviewed_by uuid
    references public.profiles (id) on delete set null;

comment on column public.payroll_closing_items.is_reviewed is
  'Gestor marcou a linha como já conferida para o mês.';

comment on column public.payroll_closing_items.reviewed_at is
  'Quando a linha foi marcada como conferida.';

comment on column public.payroll_closing_items.reviewed_by is
  'Perfil do gestor que marcou a linha como conferida.';

create index if not exists payroll_closing_items_reviewed_idx
  on public.payroll_closing_items (payroll_closing_id, is_reviewed);
