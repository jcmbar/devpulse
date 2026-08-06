-- Clarify that rematerialize now copies delay/rework decisions onto the new batch.

comment on column public.delay_justification_requests.import_id is
  'Compilado batch (snapshot). Rematerialize creates a new import_id; pending/accepted/rejected rows for cards that still exist are copied onto the new batch.';
