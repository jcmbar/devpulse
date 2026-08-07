-- Align operational email template defaults with ZeptoMail / athoslabs.com.br.
-- Auth emails remain on Supabase Auth.

update public.email_templates
set
  from_name = 'DevPulse',
  from_email = 'contato@athoslabs.com.br',
  reply_to = 'jefferson@athoslabs.com.br',
  updated_at = timezone('utc', now())
where from_email in ('noreply@devpulse.local', 'contato@athoslabs.com.br')
   or reply_to is null
   or reply_to = '';
