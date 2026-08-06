-- Operational email configuration (DevPulse transactional sends).
-- Auth invite/reset emails stay on Supabase Auth — not covered here.

-- ---------------------------------------------------------------------------
-- Send types (catalog)
-- ---------------------------------------------------------------------------

create table if not exists public.email_send_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique
    check (code in ('financeiro', 'rh', 'colaborador')),
  label text not null,
  description text,
  trigger_mode text not null
    check (trigger_mode in ('manual', 'automatic')),
  trigger_event text
    check (
      trigger_event is null
      or trigger_event in ('meal_pix_uploaded', 'closing_finalized')
    ),
  recipient_mode text not null
    check (recipient_mode in ('fixed_list', 'context_developer')),
  required_attachments text[] not null default '{}',
  optional_attachments text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.email_send_types is
  'Tipos de envio operacional DevPulse (Financeiro, RH, Colaborador).';

create trigger email_send_types_set_updated_at
before update on public.email_send_types
for each row
execute function public.set_updated_at();

alter table public.email_send_types enable row level security;

create policy "email_send_types_select_authenticated"
  on public.email_send_types for select to authenticated using (true);

create policy "email_send_types_admin_gestor_write"
  on public.email_send_types for all to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

-- ---------------------------------------------------------------------------
-- Templates
-- ---------------------------------------------------------------------------

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  send_type_id uuid not null references public.email_send_types (id) on delete cascade,
  internal_name text not null,
  from_name text not null default 'DevPulse',
  from_email text not null,
  reply_to text,
  default_to text,
  default_cc text,
  subject_template text not null,
  body_html text not null,
  signature_html text,
  logo_url text,
  banner_url text,
  is_active boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

comment on table public.email_templates is
  'Templates HTML de e-mails operacionais. Um ativo por tipo de envio.';

create unique index if not exists email_templates_one_active_per_type
  on public.email_templates (send_type_id)
  where is_active = true;

create index if not exists email_templates_send_type_idx
  on public.email_templates (send_type_id);

create trigger email_templates_set_updated_at
before update on public.email_templates
for each row
execute function public.set_updated_at();

alter table public.email_templates enable row level security;

create policy "email_templates_select_authenticated"
  on public.email_templates for select to authenticated using (true);

create policy "email_templates_admin_gestor_write"
  on public.email_templates for all to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

-- ---------------------------------------------------------------------------
-- Fixed recipients (Financeiro / RH)
-- ---------------------------------------------------------------------------

create table if not exists public.email_type_recipients (
  id uuid primary key default gen_random_uuid(),
  send_type_id uuid not null references public.email_send_types (id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'to'
    check (role in ('to', 'cc')),
  developer_id uuid references public.developers (id) on delete set null,
  profile_id uuid references public.profiles (id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint email_type_recipients_email_check
    check (position('@' in email) > 1)
);

comment on table public.email_type_recipients is
  'Destinatários fixos do setor (Financeiro/RH). Não é o colaborador do fechamento.';

create index if not exists email_type_recipients_type_idx
  on public.email_type_recipients (send_type_id)
  where is_active = true;

create trigger email_type_recipients_set_updated_at
before update on public.email_type_recipients
for each row
execute function public.set_updated_at();

alter table public.email_type_recipients enable row level security;

create policy "email_type_recipients_select_admin_gestor"
  on public.email_type_recipients for select to authenticated
  using (public.is_admin_or_gestor());

create policy "email_type_recipients_admin_gestor_write"
  on public.email_type_recipients for all to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

-- ---------------------------------------------------------------------------
-- Dispatch history / status per closing × type
-- ---------------------------------------------------------------------------

create table if not exists public.email_dispatches (
  id uuid primary key default gen_random_uuid(),
  send_type_id uuid not null references public.email_send_types (id) on delete restrict,
  monthly_closing_id uuid not null references public.monthly_closings (id) on delete cascade,
  developer_id uuid not null references public.developers (id) on delete cascade,
  year_month text not null,
  status text not null
    check (status in ('unavailable', 'ready', 'sent', 'error')),
  triggered_by text not null
    check (triggered_by in ('manual', 'system')),
  actor_user_id uuid references public.profiles (id) on delete set null,
  template_id uuid references public.email_templates (id) on delete set null,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  subject_rendered text,
  body_html_rendered text,
  attachment_types text[] not null default '{}',
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint email_dispatches_closing_type_unique unique (monthly_closing_id, send_type_id)
);

comment on table public.email_dispatches is
  'Status e histórico de envio operacional por fechamento × tipo.';

create index if not exists email_dispatches_closing_idx
  on public.email_dispatches (monthly_closing_id);

create index if not exists email_dispatches_developer_month_idx
  on public.email_dispatches (developer_id, year_month);

create trigger email_dispatches_set_updated_at
before update on public.email_dispatches
for each row
execute function public.set_updated_at();

alter table public.email_dispatches enable row level security;

create policy "email_dispatches_select_admin_gestor"
  on public.email_dispatches for select to authenticated
  using (public.is_admin_or_gestor());

create policy "email_dispatches_admin_gestor_write"
  on public.email_dispatches for all to authenticated
  using (public.is_admin_or_gestor())
  with check (public.is_admin_or_gestor());

-- Developers may see dispatches of their own closings (optional transparency).
create policy "email_dispatches_select_own"
  on public.email_dispatches for select to authenticated
  using (
    developer_id in (
      select d.id from public.developers d where d.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Seeds: types + default templates
-- ---------------------------------------------------------------------------

insert into public.email_send_types (
  code, label, description, trigger_mode, trigger_event,
  recipient_mode, required_attachments, optional_attachments
)
values
  (
    'financeiro',
    'Financeiro',
    'Envio manual ao setor Financeiro com NF e boleto após finalize.',
    'manual',
    null,
    'fixed_list',
    array['invoice_pdf', 'boleto_pdf']::text[],
    '{}'::text[]
  ),
  (
    'rh',
    'RH',
    'Envio automático ao RH quando o comprovante PIX de refeição é anexado.',
    'automatic',
    'meal_pix_uploaded',
    'fixed_list',
    array['meal_pix_receipt']::text[],
    '{}'::text[]
  ),
  (
    'colaborador',
    'Colaborador (recibo)',
    'Recibo/resumo automático ao colaborador no finalize do fechamento, com valores a receber e documentos.',
    'automatic',
    'closing_finalized',
    'context_developer',
    '{}'::text[],
    array['invoice_pdf', 'boleto_pdf']::text[]
  )
on conflict (code) do nothing;

-- Default templates (inactive until from_email/recipients are configured in UI;
-- seeded as active with placeholder from — gestor deve revisar).
insert into public.email_templates (
  send_type_id,
  internal_name,
  from_name,
  from_email,
  subject_template,
  body_html,
  signature_html,
  is_active
)
select
  t.id,
  v.internal_name,
  'DevPulse',
  'noreply@devpulse.local',
  v.subject_template,
  v.body_html,
  v.signature_html,
  true
from public.email_send_types t
join (
  values
  (
    'financeiro',
    'Financeiro — padrão',
    'Fechamento {{developer_name}} — {{year_month_label}}',
    $fin$
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;margin:0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dbe3ee;border-radius:14px;overflow:hidden;">
      {{#if banner_url}}<tr><td><img src="{{banner_url}}" alt="" style="display:block;width:100%;max-height:120px;object-fit:cover;" /></td></tr>{{/if}}
      <tr><td style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#12324a);color:#fff;">
        {{#if logo_url}}<img src="{{logo_url}}" alt="Logo" style="height:28px;margin-bottom:10px;" />{{/if}}
        <div style="font-size:18px;font-weight:700;">Envio ao Financeiro</div>
        <div style="font-size:13px;color:#cbd5e1;margin-top:4px;">DevPulse · documentos do fechamento</div>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Olá,</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
          Seguem a <strong>nota fiscal</strong> e o <strong>boleto</strong> do fechamento de
          <strong>{{developer_name}}</strong> referente a <strong>{{year_month_label}}</strong>.
        </p>
        <p style="margin:0 0 8px;font-size:14px;color:#475569;">Valor da NF: <strong>{{invoice_amount}}</strong></p>
        <p style="margin:16px 0 0;font-size:13px;color:#64748b;">Os PDFs estão anexados a este e-mail.</p>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">{{signature_html}}</td></tr>
    </table>
  </td></tr>
</table>
$fin$,
    '<p style="margin:0;">Equipe DevPulse</p>'
  ),
  (
    'rh',
    'RH — comprovante refeição',
    'Comprovante PIX refeição — {{developer_name}} ({{year_month_label}})',
    $rh$
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;margin:0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dbe3ee;border-radius:14px;overflow:hidden;">
      {{#if banner_url}}<tr><td><img src="{{banner_url}}" alt="" style="display:block;width:100%;max-height:120px;object-fit:cover;" /></td></tr>{{/if}}
      <tr><td style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#14532d);color:#fff;">
        {{#if logo_url}}<img src="{{logo_url}}" alt="Logo" style="height:28px;margin-bottom:10px;" />{{/if}}
        <div style="font-size:18px;font-weight:700;">Comprovante para o RH</div>
        <div style="font-size:13px;color:#bbf7d0;margin-top:4px;">Reembolso de refeição · DevPulse</div>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Olá,</p>
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">
          O colaborador <strong>{{developer_name}}</strong> anexou o comprovante PIX de refeição
          do fechamento de <strong>{{year_month_label}}</strong>.
        </p>
        <p style="margin:0 0 8px;font-size:14px;color:#475569;">Valor refeição: <strong>{{meal_amount}}</strong></p>
        <p style="margin:0 0 8px;font-size:14px;color:#475569;">Dias presenciais (refeição): <strong>{{meal_days}}</strong></p>
        <p style="margin:16px 0 0;font-size:13px;color:#64748b;">O PDF do comprovante está anexado.</p>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">{{signature_html}}</td></tr>
    </table>
  </td></tr>
</table>
$rh$,
    '<p style="margin:0;">Equipe DevPulse</p>'
  ),
  (
    'colaborador',
    'Colaborador — recibo do fechamento',
    'Seu recibo de fechamento — {{year_month_label}}',
    $col$
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;margin:0;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <tr><td align="center">
    <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #dbe3ee;border-radius:14px;overflow:hidden;">
      {{#if banner_url}}<tr><td><img src="{{banner_url}}" alt="" style="display:block;width:100%;max-height:120px;object-fit:cover;" /></td></tr>{{/if}}
      <tr><td style="padding:20px 24px;background:linear-gradient(135deg,#0f172a,#0e7490);color:#fff;">
        {{#if logo_url}}<img src="{{logo_url}}" alt="Logo" style="height:28px;margin-bottom:10px;" />{{/if}}
        <div style="font-size:18px;font-weight:700;">Recibo do seu fechamento</div>
        <div style="font-size:13px;color:#a5f3fc;margin-top:4px;">{{year_month_label}} · DevPulse</div>
      </td></tr>
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Olá, <strong>{{developer_name}}</strong>,</p>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
          Seu fechamento de <strong>{{year_month_label}}</strong> foi finalizado. Segue o resumo dos valores:
        </p>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;margin:0 0 16px;">
          <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:13px;color:#64748b;">Valor base</td><td align="right" style="padding:10px 14px;font-size:14px;font-weight:600;">{{base_amount}}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#64748b;">Diferencial</td><td align="right" style="padding:10px 14px;font-size:14px;font-weight:600;">{{differential_amount}}</td></tr>
          <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:13px;color:#64748b;">Deslocamento</td><td align="right" style="padding:10px 14px;font-size:14px;font-weight:600;">{{travel_amount}}</td></tr>
          <tr><td style="padding:10px 14px;font-size:13px;color:#64748b;">Refeição</td><td align="right" style="padding:10px 14px;font-size:14px;font-weight:600;">{{meal_amount}}</td></tr>
          <tr style="background:#ecfeff;"><td style="padding:12px 14px;font-size:14px;font-weight:700;color:#0e7490;">Valor a receber (NF)</td><td align="right" style="padding:12px 14px;font-size:16px;font-weight:700;color:#0e7490;">{{invoice_amount}}</td></tr>
        </table>
        <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Horas trabalhadas: <strong>{{worked_hours}}</strong></p>
        <p style="margin:0 0 16px;font-size:13px;color:#64748b;">Dias deslocamento / refeição: <strong>{{travel_days}}</strong> / <strong>{{meal_days}}</strong></p>
        <p style="margin:0;font-size:13px;color:#64748b;">Quando disponíveis, a nota fiscal e o boleto que você enviou estão anexados a este e-mail.</p>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">{{signature_html}}</td></tr>
    </table>
  </td></tr>
</table>
$col$,
    '<p style="margin:0;">Atenciosamente,<br/>Equipe DevPulse</p>'
  )
) as v(code, internal_name, subject_template, body_html, signature_html)
  on t.code = v.code
where not exists (
  select 1 from public.email_templates et where et.send_type_id = t.id
);
