-- Holidays used to reduce capacity weekday weights.
-- Start with national (Brazil); scope/region_code ready for state/city later.

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_on date not null,
  name text not null,
  scope text not null default 'national'
    check (scope in ('national', 'state', 'city', 'team')),
  -- Empty string = nationwide / not applicable. Future: UF code, city slug, etc.
  region_code text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint holidays_unique_day_scope unique (holiday_on, scope, region_code)
);

create index if not exists holidays_holiday_on_idx
  on public.holidays (holiday_on);

create index if not exists holidays_active_on_idx
  on public.holidays (holiday_on)
  where is_active = true;

comment on table public.holidays is
  'Calendar holidays that zero capacity weight on matching dates. National seeded; state/city/team via scope+region_code.';

create trigger holidays_set_updated_at
before update on public.holidays
for each row
execute function public.set_updated_at();

alter table public.holidays enable row level security;

create policy "holidays_select_authenticated"
  on public.holidays
  for select
  to authenticated
  using (true);

create policy "holidays_admin_gestor_write"
  on public.holidays
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'gestor')
    )
  );

-- Brazilian federal holidays for 2025–2027 (fixed dates).
-- Consciência Negra (20/11) is federal since Lei 14.759/2023.
insert into public.holidays (holiday_on, name, scope, region_code, is_active)
values
  -- 2025
  ('2025-01-01', 'Confraternização Universal', 'national', '', true),
  ('2025-04-21', 'Tiradentes', 'national', '', true),
  ('2025-05-01', 'Dia do Trabalho', 'national', '', true),
  ('2025-09-07', 'Independência do Brasil', 'national', '', true),
  ('2025-10-12', 'Nossa Senhora Aparecida', 'national', '', true),
  ('2025-11-02', 'Finados', 'national', '', true),
  ('2025-11-15', 'Proclamação da República', 'national', '', true),
  ('2025-11-20', 'Dia da Consciência Negra', 'national', '', true),
  ('2025-12-25', 'Natal', 'national', '', true),
  -- 2026
  ('2026-01-01', 'Confraternização Universal', 'national', '', true),
  ('2026-04-21', 'Tiradentes', 'national', '', true),
  ('2026-05-01', 'Dia do Trabalho', 'national', '', true),
  ('2026-09-07', 'Independência do Brasil', 'national', '', true),
  ('2026-10-12', 'Nossa Senhora Aparecida', 'national', '', true),
  ('2026-11-02', 'Finados', 'national', '', true),
  ('2026-11-15', 'Proclamação da República', 'national', '', true),
  ('2026-11-20', 'Dia da Consciência Negra', 'national', '', true),
  ('2026-12-25', 'Natal', 'national', '', true),
  -- 2027
  ('2027-01-01', 'Confraternização Universal', 'national', '', true),
  ('2027-04-21', 'Tiradentes', 'national', '', true),
  ('2027-05-01', 'Dia do Trabalho', 'national', '', true),
  ('2027-09-07', 'Independência do Brasil', 'national', '', true),
  ('2027-10-12', 'Nossa Senhora Aparecida', 'national', '', true),
  ('2027-11-02', 'Finados', 'national', '', true),
  ('2027-11-15', 'Proclamação da República', 'national', '', true),
  ('2027-11-20', 'Dia da Consciência Negra', 'national', '', true),
  ('2027-12-25', 'Natal', 'national', '', true)
on conflict (holiday_on, scope, region_code) do nothing;
