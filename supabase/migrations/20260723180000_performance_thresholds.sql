-- Team-wide performance bands for aproveitamento interpretation (Compilado).
-- Defaults match spreadsheet: <70%, 70–84%, 85–99%, ≥100%.

create table if not exists public.performance_thresholds (
  id smallint primary key default 1 check (id = 1),
  band_very_low_max numeric(8, 6) not null default 0.70
    check (band_very_low_max > 0 and band_very_low_max < 1),
  band_low_max numeric(8, 6) not null default 0.85
    check (band_low_max > band_very_low_max),
  band_average_max numeric(8, 6) not null default 1.00
    check (band_average_max > band_low_max),
  label_very_low text not null default 'Muito abaixo',
  label_low text not null default 'Abaixo',
  label_average text not null default 'Na média',
  label_excellent text not null default 'Excelente',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.performance_thresholds is
  'Singleton team config for aproveitamento bands. rate < very_low_max → very_low; < low_max → low; < average_max → average; else excellent.';

insert into public.performance_thresholds (id)
values (1)
on conflict (id) do nothing;

create trigger performance_thresholds_set_updated_at
before update on public.performance_thresholds
for each row
execute function public.set_updated_at();

alter table public.performance_thresholds enable row level security;

create policy "performance_thresholds_select_authenticated"
  on public.performance_thresholds
  for select
  to authenticated
  using (true);

create policy "performance_thresholds_admin_gestor_write"
  on public.performance_thresholds
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
