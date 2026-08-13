-- Developer avatars mirrored from Jira into public storage.

alter table public.developers
  add column if not exists avatar_path text,
  add column if not exists avatar_synced_at timestamptz;

comment on column public.developers.avatar_path is
  'Storage path in developer-avatars bucket ({developer_id}/avatar.*). Null = no photo.';
comment on column public.developers.avatar_synced_at is
  'When avatar was last fetched from Jira (or cleared).';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'developer-avatars',
  'developer-avatars',
  true,
  524288,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path: {developer_id}/avatar.{ext}
-- Reads are public via bucket.public = true.
-- Writes only via service role (no authenticated insert/update policies).
