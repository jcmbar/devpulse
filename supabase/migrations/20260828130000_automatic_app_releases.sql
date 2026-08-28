-- Extend release history for automatic deployment registration.

alter table public.app_releases
  add column if not exists commit_sha text,
  add column if not exists source text not null default 'manual';

create unique index if not exists app_releases_commit_sha_uidx
  on public.app_releases (commit_sha)
  where commit_sha is not null;

alter table public.app_releases
  drop constraint if exists app_releases_version_unique;

-- A deployment is uniquely identified by its source commit. Keeping version
-- unique is unnecessary once the commit is the canonical release identity.
