# Fluxo de convite por e-mail (Supabase Auth)

Experiência própria do DevPulse: e-mail em português → `/auth/confirm` → `/set-password` → `updateUser({ password })`.

## Visão geral

```text
Admin convida (inviteUserByEmail)
        ↓
E-mail "Invite user" (template customizado)
        ↓
CTA → /auth/confirm?token_hash=...&type=invite&redirect_to=/set-password
        ↓
verifyOtp → sessão cookie
        ↓
Redirect → /set-password
        ↓
Usuário cria senha (updateUser) → /app
```

Reenvio / redefinição usa o template **Reset password** com `type=recovery` e o mesmo `/auth/confirm` + `/set-password`.

Compatibilidade: se o template padrão do Supabase for mantido, `/set-password` ainda aceita tokens no hash (`#access_token=...`) ou `?code=` (PKCE).

---

## 1. Site URL e Redirect URLs (Supabase)

**Authentication → URL Configuration**

O **Site URL** é único por projeto, então deve apontar para **produção**:

| Campo | Valor |
|-------|--------|
| **Site URL** | `https://seu-dominio` |
| **Redirect URLs** | veja lista abaixo |

Inclua **todas** estas Redirect URLs (local + produção):

```text
http://localhost:3000/set-password
http://localhost:3000/auth/confirm
http://localhost:3000/**
https://seu-dominio/set-password
https://seu-dominio/auth/confirm
https://seu-dominio/**
```

O link do e-mail é montado com `{{ .RedirectTo }}`, ou seja, com o
`NEXT_PUBLIC_SITE_URL` do ambiente que **enviou** o convite. Assim o mesmo
template serve local e produção sem trocar o Site URL.

Cada ambiente precisa da sua env (`.env.local` em dev, painel do host em
produção), sempre sem barra final:

```text
# local
NEXT_PUBLIC_SITE_URL=http://localhost:3000
# produção (Render → Environment)
NEXT_PUBLIC_SITE_URL=https://seu-dominio
```

---

## 2. Template Invite user

**Authentication → Email Templates → Invite user**

**Subject**

```text
Você foi convidado para acessar o DevPulse
```

**Body (HTML)** — cole o conteúdo de [`docs/email-templates/invite-user.html`](./email-templates/invite-user.html).

CTA obrigatório (já está no HTML):

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite&redirect_to=/set-password">
  Criar senha
</a>
```

`{{ .RedirectTo }}` já é `<origem-do-ambiente>/auth/confirm`. Não use
`{{ .SiteURL }}` aqui: ele é global e faria os e-mails de local apontarem
para produção (e vice-versa). Não use `{{ .ConfirmationURL }}` se quiser
forçar a rota própria `/auth/confirm`.

---

## 3. Template Reset password (reenvio)

**Authentication → Email Templates → Reset password**

**Subject (sugerido)**

```text
Defina sua senha do DevPulse
```

**CTA**

```html
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery&redirect_to=/set-password">
  Criar senha
</a>
```

HTML completo: [`docs/email-templates/reset-password.html`](./email-templates/reset-password.html).

---

## 4. SMTP customizado — agora ou depois?

| Opção | Quando |
|-------|--------|
| **SMTP padrão Supabase** | OK para MVP / local. Remetente continua “Supabase Auth” (ou similar). Assunto e corpo do template **já** ficam em português. |
| **Custom SMTP** (Resend, SES, SendGrid, etc.) | Etapa seguinte, quando quiser `noreply@seu-dominio` e melhor deliverability. |

Custom SMTP **não é necessário** para o fluxo técnico (confirm + set-password). Só muda identidade do remetente e confiabilidade de entrega.

Configure depois em **Project Settings → Authentication → SMTP Settings**.

---

## 5. Arquivos no app

| Arquivo | Papel |
|---------|--------|
| `src/services/auth/invite-user.ts` | `inviteUserByEmail` + sync profile |
| `src/services/auth/resend-invite.ts` | `resetPasswordForEmail` (reenvio) |
| `src/services/auth/shared.ts` | `getSiteUrl` / `getAuthConfirmRedirectTo` |
| `src/app/auth/confirm/route.ts` | `verifyOtp` / `exchangeCodeForSession` → redirect |
| `src/app/set-password/page.tsx` | UI “Crie sua senha” |
| `src/app/set-password/set-password-form.tsx` | Sessão + `updateUser({ password })` |
| `src/lib/supabase/{client,server,admin,proxy}.ts` | Clients Auth |

Não é necessário `/auth/callback` separado neste fluxo (token_hash).

---

## 6. Teste ponta a ponta

Pré-requisitos:

1. `.env.local` com `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000`
2. Redirect URLs e templates atualizados no dashboard
3. `npm run dev`

Passos:

1. Login como admin/gestor → **Developers** → editar (ou convidar) um e-mail **novo** (não registrado)
2. **Convidar usuário** com role desejada
3. Abrir o e-mail (Inbucket do Supabase local / caixa real / Auth logs)
4. Conferir: assunto em PT, CTA **Criar senha**, link com `/auth/confirm?...&type=invite&redirect_to=/set-password`
5. Clicar no link → deve passar por confirm e abrir **Crie sua senha**
6. Preencher senha + confirmar → **Ativar acesso**
7. Deve redirecionar para `/app` já autenticado
8. Logout → login com e-mail/senha → sucesso

Casos extras:

- Link expirado → mensagem de erro + “Ir para o login”
- **Reenviar convite** → e-mail Recovery → mesmo `/set-password`
- Template antigo (hash) → ainda deve funcionar em `/set-password`

---

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| Link do e-mail vem com `localhost` em produção | `NEXT_PUBLIC_SITE_URL` ausente/errado no host (Render). Defina a URL pública do app e redeploy. Confirme o template usando `{{ .RedirectTo }}`, não só `{{ .SiteURL }}`. Se o e-mail foi disparado pelo `next dev` local, o link será localhost por design. |
| “redirect_uri mismatch” / link não abre o app | `/auth/confirm` do ambiente não está nas Redirect URLs |
| “invalid_or_expired” | Link já usado, expirado, ou `type` errado no template |
| E-mail em inglês / CTA genérico | Template Invite ainda padrão — atualize no dashboard |
| Remetente “Supabase Auth” | Esperado sem custom SMTP |
| Convite “already registered” | Use **Reenviar convite**, não novo invite |
