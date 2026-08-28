-- Add the partial completion status introduced after the initial STG schema.

alter type public.stg_run_status
  add value if not exists 'partial';
