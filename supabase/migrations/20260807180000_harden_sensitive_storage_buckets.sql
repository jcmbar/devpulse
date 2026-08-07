-- Harden sensitive storage buckets: keep private, no public listing.
-- Defense-in-depth alongside app-layer authorized signed URLs.

update storage.buckets
set
  public = false,
  file_size_limit = coalesce(file_size_limit, 10485760),
  allowed_mime_types = coalesce(allowed_mime_types, array['application/pdf']::text[])
where id in ('monthly-closing-attachments', 'email-attachment-backups');

comment on table public.email_dispatch_attachment_backups is
  'Cópia arquivada dos PDFs enviados por e-mail (Financeiro/RH). storage_path é server-only; downloads via URL assinada curta após requireTeamAccess.';
