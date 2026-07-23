-- Clarify that developers.team_code is a denormalized auxiliary field
-- synced from teams.code when developers.team_id is set.
-- Canonical team assignment is developers.team_id.

comment on column public.developers.team_code is
  'Denormalized holiday match key synced from teams.code via team_id. Not a free-form primary assignment; prefer developers.team_id.';
