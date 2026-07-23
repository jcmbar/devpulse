-- Developer holiday context for scoped capacity (state / city / team).
-- Codes match holidays.region_code exactly after trim+uppercase.
-- Conventions:
--   state_code → BR-SP
--   city_code  → BR-SP-SAO_PAULO
--   team_code  → TEAM-CORE (stable slug; no teams table yet)

alter table public.developers
  add column if not exists state_code text not null default '',
  add column if not exists city_code text not null default '',
  add column if not exists team_code text not null default '';

comment on column public.developers.state_code is
  'Holiday state match key (e.g. BR-SP). Empty = no state holidays apply.';
comment on column public.developers.city_code is
  'Holiday city match key (e.g. BR-SP-SAO_PAULO). Empty = no city holidays apply.';
comment on column public.developers.team_code is
  'Holiday team match key (e.g. TEAM-CORE). Empty = no team holidays apply.';

create index if not exists developers_state_code_idx
  on public.developers (state_code)
  where state_code <> '';

create index if not exists developers_team_code_idx
  on public.developers (team_code)
  where team_code <> '';
